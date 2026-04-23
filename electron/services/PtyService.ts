import { type BrowserWindow, Notification } from "electron";
import * as pty from "node-pty";
import { v4 as uuidv4 } from "uuid";
import { execFileSync } from "child_process";
import stripAnsi from "strip-ansi";
import log from "../log";
import type { PtyInfo, CanvasGraph } from "../types";

// ---------------------------------------------------------------------------
// Ring Buffer — circular byte buffer for PTY output history
// ---------------------------------------------------------------------------

const RING_BUFFER_CAPACITY = 8192; // 8KB, same as Rust PtyManager

class RingBuffer {
  private buf: Buffer;
  private head = 0; // next write position
  private length = 0; // bytes currently stored

  constructor(capacity = RING_BUFFER_CAPACITY) {
    this.buf = Buffer.alloc(capacity);
  }

  /** Append bytes. Oldest data is evicted when capacity is exceeded. */
  push(data: Buffer): void {
    const cap = this.buf.length;

    for (let i = 0; i < data.length; i++) {
      this.buf[this.head] = data[i];
      this.head = (this.head + 1) % cap;
      if (this.length < cap) {
        this.length++;
      }
    }
  }

  /** Read the entire buffer contents in chronological order. */
  readAll(): number[] {
    if (this.length === 0) return [];

    const cap = this.buf.length;
    const start = (this.head - this.length + cap) % cap;
    const result: number[] = new Array(this.length);

    for (let i = 0; i < this.length; i++) {
      result[i] = this.buf[(start + i) % cap];
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// PTY Instance — per-session state
// ---------------------------------------------------------------------------

interface PtyInstance {
  process: pty.IPty;
  label: string;
  ringBuffer: RingBuffer;
  /** Accumulated output chunks waiting to be flushed to the renderer. */
  flushBuffer: Buffer[];
  /** 16ms coalesce timer handle. */
  coalesceTimer: ReturnType<typeof setTimeout> | null;
  /** 150ms max-wait forced flush timer handle. */
  maxWaitTimer: ReturnType<typeof setTimeout> | null;
  /** Timestamp of last output activity. */
  lastActivityTime: number;
  /** 5s idle detection timer. Fires when output stops. */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Current status for frontend monitoring. */
  currentStatus: "active" | "awaiting_approval" | "idle";
}

// ---------------------------------------------------------------------------
// PtyService
// ---------------------------------------------------------------------------

const COALESCE_MS = 16; // ~60fps batch window
const MAX_WAIT_MS = 150; // forced flush ceiling

/** Patterns that should never be dispatched by AI to a terminal. */
const BLOCKED_PATTERNS: RegExp[] = [
  /\brm\s+(-[rfRF]+\s+)?[\/\\]/i,
  /\bdel\s+\/[sS]/i,
  /\bformat\s+[a-zA-Z]:/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
  /\bmkfs\b/i,
  /\bdd\s+if=.*of=\/dev\//i,
  />\s*\/dev\/[sh]d[a-z]/i,
  /\brm\s+(-[rfRF]+\s+)?\*/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
];

/** Check a command against the blocklist. Returns the matched pattern or null. */
function checkBlockedCommand(command: string): string | null {
  const normalized = command.trim();
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) return pattern.source;
  }
  return null;
}

// Resolve preferred Windows shell once at module load.
// Default: powershell.exe (always present on Win10+).
// Upgrade: pwsh.exe (PowerShell 7+) only if confirmed on PATH.
const WIN_SHELL: string = (() => {
  if (process.platform !== "win32") return "";
  try {
    execFileSync("where", ["pwsh.exe"], { stdio: "ignore", timeout: 3000 });
    return "pwsh.exe";
  } catch {
    return "powershell.exe";
  }
})();

export class PtyService {
  private win: BrowserWindow | null = null;
  private instances = new Map<string, PtyInstance>();
  /** Tracks last piped output hash per "sourceId:targetId" to skip unchanged data. */
  private pipeHashes = new Map<string, string>();
  /** Callback invoked when a [BROADCAST] token is detected in PTY output. */
  private broadcastHandler: ((sourcePtyId: string, command: string) => void) | null = null;
  /** Callback invoked when an [ASK_APPROVAL] token is detected in PTY output. */
  private approvalHandler: ((sourcePtyId: string, command: string) => void) | null = null;
  /** Callback invoked when a <<SEND_TO:...>> token is detected in PTY output. */
  private dispatchHandler: ((sourcePtyId: string, targetLabel: string, command: string) => void) | null = null;
  /** Commands awaiting user approval, keyed by ptyId. */
  private pendingApprovals = new Map<string, string>();

  /** Store the BrowserWindow reference used for webContents.send. */
  setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  /** Register a handler for [BROADCAST] tokens detected in PTY output. */
  setBroadcastHandler(handler: (sourcePtyId: string, command: string) => void): void {
    this.broadcastHandler = handler;
  }

  /** Register a handler for [ASK_APPROVAL] tokens detected in PTY output. */
  setApprovalHandler(handler: (sourcePtyId: string, command: string) => void): void {
    this.approvalHandler = handler;
  }

  /** Register a handler for <<SEND_TO:...>> tokens detected in PTY output. */
  setDispatchHandler(handler: (sourcePtyId: string, targetLabel: string, command: string) => void): void {
    this.dispatchHandler = handler;
  }

  /** Execute a previously stored pending approval command. */
  approvePending(ptyId: string): string | null {
    const cmd = this.pendingApprovals.get(ptyId);
    if (!cmd) return null;
    this.pendingApprovals.delete(ptyId);
    try {
      const payload = cmd + "\r\n";
      const bytes = Array.from(Buffer.from(payload, "utf-8"));
      this.write(ptyId, bytes);
    } catch { /* PTY may be dead */ }
    return cmd;
  }

  /** Discard a previously stored pending approval command. */
  rejectPending(ptyId: string): string | null {
    const cmd = this.pendingApprovals.get(ptyId);
    if (!cmd) return null;
    this.pendingApprovals.delete(ptyId);
    return cmd;
  }

  // -----------------------------------------------------------------------
  // Spawn
  // -----------------------------------------------------------------------

  spawn(
    cols: number,
    rows: number,
    cwd?: string,
    label?: string,
  ): PtyInfo {
    const id = uuidv4();
    const resolvedLabel = label ?? `Terminal ${id.slice(0, 8)}`;

    // Safe defaults: prevent undefined/NaN/0 from reaching node-pty
    const safeCols = (Number.isFinite(cols) && cols > 0) ? cols : 80;
    const safeRows = (Number.isFinite(rows) && rows > 0) ? rows : 24;
    const safeCwd = (typeof cwd === "string" && cwd.length > 0)
      ? cwd
      : (process.env.USERPROFILE || process.env.HOME || process.cwd());

    // Windows: use cached shell (pwsh.exe if available, else powershell.exe).
    // No -NoProfile flag — user needs profile loading (Oh My Posh, etc.).
    // Args MUST stay as [] literal (node-pty C++ binding crashes otherwise).
    const safeShell =
      process.platform === "win32"
        ? WIN_SHELL
        : process.env.SHELL || "bash";

    log.info(`[PtyService] spawn: shell=${safeShell} cols=${safeCols} rows=${safeRows} cwd=${safeCwd}`);

    // Surgical env cleanup: remove ONLY the VS Code IPC vars that cause
    // Claude CLI to detect the extension host and open unwanted tabs.
    // Keep everything else (ELECTRON_*, Windows system vars) — node-pty
    // needs ELECTRON_RUN_AS_NODE for conpty_console_list_agent.js.
    const cleanEnv = { ...process.env } as Record<string, string>;
    delete cleanEnv.VSCODE_IPC_HOOK;
    delete cleanEnv.VSCODE_IPC_HOOK_CLI;
    delete cleanEnv.VSCODE_PID;
    delete cleanEnv.VSCODE_AMD_ENTRYPOINT;
    delete cleanEnv.VSCODE_NLS_CONFIG;
    delete cleanEnv.ORIGINAL_XDG_CURRENT_DESKTOP;

    // CRITICAL: second arg MUST be an explicit Array literal `[]`.
    // node-pty's C++ binding crashes if args is undefined or not an Array.
    // useConpty: false avoids AttachConsole failed crash from conpty_console_list.
    const proc = pty.spawn(safeShell, [], {
      name: "xterm-color",
      cols: safeCols,
      rows: safeRows,
      cwd: safeCwd,
      env: cleanEnv,
      useConpty: true,
    });

    const instance: PtyInstance = {
      process: proc,
      label: resolvedLabel,
      ringBuffer: new RingBuffer(),
      flushBuffer: [],
      coalesceTimer: null,
      maxWaitTimer: null,
      lastActivityTime: Date.now(),
      idleTimer: null,
      currentStatus: "active" as const,
    };

    this.instances.set(id, instance);

    // --- Output handler: detect tokens, push to ring buffer + schedule flush ---
    proc.onData((data: string) => {
      const { cleanData, broadcasts, approvals, dispatches, awaitingDetected } = this.extractTokens(data);

      // Fan-out broadcast commands to connected terminals
      for (const cmd of broadcasts) {
        log.info(`[PtyService] broadcast detected from ${id}: ${cmd}`);
        this.broadcastHandler?.(id, cmd);
      }

      // Store approval requests and notify frontend
      for (const cmd of approvals) {
        log.info(`[PtyService] approval request from ${id}: ${cmd}`);
        this.pendingApprovals.set(id, cmd);
        this.approvalHandler?.(id, cmd);
      }

      // Swarm dispatch: route commands to named target terminals via backend handler
      for (const dispatch of dispatches) {
        log.info(`[PtyService] dispatch detected from ${id} -> ${dispatch.targetLabel}: ${dispatch.command}`);
        this.dispatchHandler?.(id, dispatch.targetLabel, dispatch.command);
      }

      // --- Status tracking: activity, approval detection, idle timer ---
      instance.lastActivityTime = Date.now();

      if (instance.idleTimer !== null) {
        clearTimeout(instance.idleTimer);
        instance.idleTimer = null;
      }

      // Transition back to active when new output arrives (unless approval detected)
      if (instance.currentStatus !== "active" && !awaitingDetected) {
        instance.currentStatus = "active";
        this.emitStatus(id, "active");
      }

      // Awaiting approval detected
      if (awaitingDetected && instance.currentStatus !== "awaiting_approval") {
        instance.currentStatus = "awaiting_approval";
        this.emitStatus(id, "awaiting_approval");
      }

      // 5s idle timer — fires when output stops
      instance.idleTimer = setTimeout(() => {
        if (instance.currentStatus === "active" || instance.currentStatus === "awaiting_approval") {
          instance.currentStatus = "idle";
          this.emitStatus(id, "idle");
        }
      }, 5000);

      // Only push non-broadcast output to buffers
      if (cleanData.length > 0) {
        const chunk = Buffer.from(cleanData, "utf-8");
        instance.ringBuffer.push(chunk);
        instance.flushBuffer.push(chunk);

        // Start coalesce timer (resets on each chunk so fast bursts batch up)
        if (instance.coalesceTimer !== null) {
          clearTimeout(instance.coalesceTimer);
        }
        instance.coalesceTimer = setTimeout(() => {
          this.flush(id, instance);
        }, COALESCE_MS);

        // Start max-wait timer only once per batch window
        if (instance.maxWaitTimer === null) {
          instance.maxWaitTimer = setTimeout(() => {
            this.flush(id, instance);
          }, MAX_WAIT_MS);
        }
      }
    });

    // --- Exit handler ---
    proc.onExit(({ exitCode: _exitCode }) => {
      this.win?.webContents.send(`pty-exit-${id}`, id);
      this.cleanup(id);
    });

    return { id, label: resolvedLabel };
  }

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------

  write(id: string, data: number[]): void {
    const instance = this.instances.get(id);
    if (!instance) throw new Error(`PTY ${id} not found`);

    const buf = Buffer.from(data);
    instance.process.write(buf.toString("utf-8"));
    this.resetStatusOnInput(id);
  }

  /** Write a raw string directly to a PTY's stdin. Single atomic call. */
  writeString(id: string, text: string): void {
    const instance = this.instances.get(id);
    if (!instance) throw new Error(`PTY ${id} not found`);
    instance.process.write(text);
    this.resetStatusOnInput(id);
  }

  /** Write string to PTY with command sanitization. For AI dispatch only. */
  writeStringSafe(id: string, text: string): boolean {
    const blocked = checkBlockedCommand(text);
    if (blocked) {
      log.warn(`[PtyService] BLOCKED dangerous command: "${text}" (matched: ${blocked})`);
      return false;
    }
    this.writeString(id, text);
    return true;
  }

  // -----------------------------------------------------------------------
  // Resize
  // -----------------------------------------------------------------------

  resize(id: string, cols: number, rows: number): void {
    const instance = this.instances.get(id);
    if (!instance) throw new Error(`PTY ${id} not found`);

    instance.process.resize(cols, rows);
  }

  // -----------------------------------------------------------------------
  // Kill
  // -----------------------------------------------------------------------

  kill(id: string): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    try {
      instance.process.kill();
    } catch (e) {
      log.warn(`[PtyService] error killing PTY ${id}:`, e);
    }
    this.cleanup(id);
  }

  killAll(): void {
    for (const [id, instance] of this.instances) {
      try {
        instance.process.kill();
      } catch (e) {
        log.warn(`[PtyService] error killing PTY ${id}:`, e);
      }
      this.clearTimers(instance);
    }
    this.instances.clear();
    this.pipeHashes.clear();
  }

  // -----------------------------------------------------------------------
  // List / Count
  // -----------------------------------------------------------------------

  list(): PtyInfo[] {
    const result: PtyInfo[] = [];
    for (const [id, instance] of this.instances) {
      result.push({ id, label: instance.label });
    }
    return result;
  }

  count(): number {
    return this.instances.size;
  }

  /** Collect all tracked PIDs for external cleanup (e.g. before-quit sweep). */
  getAllPids(): number[] {
    const pids: number[] = [];
    for (const inst of this.instances.values()) {
      const pid = inst.process.pid;
      if (pid != null) pids.push(pid);
    }
    return pids;
  }

  // -----------------------------------------------------------------------
  // Read Output (from ring buffer)
  // -----------------------------------------------------------------------

  readOutput(id: string): number[] {
    const instance = this.instances.get(id);
    if (!instance) throw new Error(`PTY ${id} not found`);

    return instance.ringBuffer.readAll();
  }

  // -----------------------------------------------------------------------
  // Pipe Output (source → target with ANSI strip + dedup)
  // -----------------------------------------------------------------------

  pipeOutput(sourceId: string, targetId: string): number {
    const rawOutput = this.readOutput(sourceId);
    if (rawOutput.length === 0) return 0;

    // Hash check: skip if output unchanged since last pipe for this pair
    const pipeKey = `${sourceId}:${targetId}`;
    const hashInput = Buffer.from(rawOutput).toString("base64");

    const prevHash = this.pipeHashes.get(pipeKey);
    if (prevHash === hashInput) return 0;

    // Strip ANSI sequences for clean text
    const rawString = Buffer.from(rawOutput).toString("utf-8");
    const clean = stripAnsi(rawString);
    if (clean.length === 0) return 0;

    // Write cleaned output to target PTY stdin
    const targetInstance = this.instances.get(targetId);
    if (!targetInstance) throw new Error(`PTY ${targetId} not found`);

    targetInstance.process.write(clean);

    // Store hash for dedup
    this.pipeHashes.set(pipeKey, hashInput);

    return Buffer.byteLength(clean, "utf-8");
  }

  // -----------------------------------------------------------------------
  // Smart Write — intercepts <<SEND_TO:...>> BEFORE writing to PTY stdin
  // -----------------------------------------------------------------------

  smartWrite(
    ptyId: string,
    text: string,
    graph: CanvasGraph | null,
    win: BrowserWindow | null,
  ): { localLines: number; dispatched: number } {
    // Optional leading quote tolerates cmd.exe echo output, e.g.
    //   echo "<<SEND_TO:frontend>> Crie a tela" -> "<<SEND_TO:frontend>> Crie a tela"
    // The trailing quote is handled by sanitizeDispatchCommand.
    const SEND_TO_RE = /^["']?<<SEND_TO:([^>\r\n]+?)>>\s*([^\r\n]+)$/;
    const lines = text.split(/\r?\n/);
    let localLines = 0;
    let dispatched = 0;

    for (const line of lines) {
      const stripped = line.trim();
      if (stripped.length === 0) continue;

      const match = stripped.match(SEND_TO_RE);
      if (match && graph) {
        const targetLabel = match[1].trim();
        const command = this.sanitizeDispatchCommand(match[2]);
        if (command.length > 0 && this.routeToTarget(ptyId, targetLabel, command, graph, win)) {
          dispatched++;
          continue;
        }
      }

      // Normal line: write to local PTY
      this.write(ptyId, Array.from(Buffer.from(stripped + "\r\n", "utf-8")));
      localLines++;
    }

    return { localLines, dispatched };
  }

  // -----------------------------------------------------------------------
  // Dispatch payload sanitizer
  //
  // In the new Swarm architecture, target terminals run an interactive CLI
  // (Claude Code) and the payload is a natural-language prompt, not a shell
  // command. But the noise sources are the same:
  //   - Stray trailing quote from `echo "<<SEND_TO:X>> prompt"` echoes
  //   - Conversational suffix from the AI on the same line
  //   - Matching outer quotes wrapping the whole prompt
  //   - Trailing punctuation (comma/semicolon) from AI chatter
  //
  // Only the clean prompt (as if typed by a human) should reach the target.
  // -----------------------------------------------------------------------

  private sanitizeDispatchCommand(raw: string): string {
    let cmd = raw.trim();
    if (cmd.length === 0) return cmd;

    // 1. Unbalanced quote: an odd count means the last one is a stray wrapper
    //    (e.g. `npm run dev" e depois me avise`). Cut it and anything after.
    for (const q of ['"', "'"]) {
      const count = (cmd.match(new RegExp(q, "g")) || []).length;
      if (count % 2 === 1) {
        const idx = cmd.lastIndexOf(q);
        if (idx >= 0) cmd = cmd.slice(0, idx).trim();
      }
    }

    // 2. Command fully wrapped in matching outer quotes with no same-type
    //    quote inside — peel them (`"npm run dev"` -> `npm run dev`).
    if (cmd.length >= 2) {
      const first = cmd[0];
      const last = cmd[cmd.length - 1];
      if ((first === '"' || first === "'") && first === last && !cmd.slice(1, -1).includes(first)) {
        cmd = cmd.slice(1, -1).trim();
      }
    }

    // 3. Trailing punctuation chatter.
    cmd = cmd.replace(/[,;]+\s*$/, "").trim();

    return cmd;
  }

  /**
   * Route a prompt to a target terminal by label.
   *
   * Target terminals run an interactive CLI (e.g. Claude Code) that treats
   * stdin as conversational input. We simulate "user types + presses Enter"
   * by writing the sanitized payload followed by a delayed `\x0D` (50ms gap).
   * The target CLI (Claude Code) runs in raw mode and needs the text buffer
   * to arrive before the Enter signal so it can process the input correctly.
   *
   * Uses bidirectional edge lookup: the target can be upstream or downstream.
   */
  routeToTarget(
    sourcePtyId: string,
    targetLabel: string,
    command: string,
    graph: CanvasGraph,
    win: BrowserWindow | null,
  ): boolean {
    // 1. Find source node by ptyId
    const sourceNode = graph.nodes.find(
      (n) => n.type === "terminal" && n.data?.ptyId === sourcePtyId,
    );
    if (!sourceNode) return false;

    // 2. Find ALL neighbors (bidirectional edges)
    const neighborIds = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.source === sourceNode.id) neighborIds.add(edge.target);
      if (edge.target === sourceNode.id) neighborIds.add(edge.source);
    }

    // 3. Find target terminal by label among neighbors (case-insensitive)
    const targetLower = targetLabel.toLowerCase();
    const targetNode = graph.nodes.find(
      (n) => neighborIds.has(n.id) && n.type === "terminal" &&
        (n.data?.label as string)?.toLowerCase() === targetLower,
    );
    if (!targetNode) return false;

    const targetPtyId = targetNode.data?.ptyId;
    if (typeof targetPtyId !== "string" || !targetPtyId) return false;

    // 4. Inject prompt into target CLI's stdin with delayed Enter.
    //    Target CLIs (Claude Code) run in raw/readline mode and need the
    //    text buffer to arrive BEFORE the Enter signal (\x0D). A 50ms gap
    //    lets the CLI process the text chunk before registering the keypress.
    const targetInstance = this.instances.get(targetPtyId);
    if (!targetInstance) return false;
    try {
      const cleanCommand = command.trim();
      const blocked = checkBlockedCommand(cleanCommand);
      if (blocked) {
        log.warn(`[PtyService] BLOCKED route to "${targetLabel}": "${cleanCommand}" (${blocked})`);
        return false;
      }
      targetInstance.process.write(cleanCommand);
      setTimeout(() => {
        try { targetInstance.process.write("\x0D"); } catch { /* PTY may be dead */ }
      }, 50);
    } catch {
      log.warn(`[Swarm] Failed to write to target PTY ${targetPtyId}`);
      return false;
    }

    log.info(`[Swarm] Routed: ${sourceNode.id} -> ${targetNode.id} (${targetLabel}): ${command}`);

    // 5. Emit visual feedback event for frontend edge flash
    win?.webContents.send("swarm-dispatch", {
      sourcePtyId,
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      targetLabel,
      command,
    });

    return true;
  }

  // -----------------------------------------------------------------------
  // Internal: extract [BROADCAST] and [ASK_APPROVAL] tokens from PTY output
  // -----------------------------------------------------------------------

  private extractTokens(rawData: string): {
    cleanData: string;
    broadcasts: string[];
    approvals: string[];
    dispatches: { targetLabel: string; command: string }[];
    awaitingDetected: boolean;
  } {
    const BROADCAST_RE = /^\[BROADCAST]\s*([^\r\n]+)$/;
    const APPROVAL_RE = /^\[ASK_APPROVAL]\s*([^\r\n]+)$/;
    // Optional leading quote tolerates echo output wrappers from cmd.exe.
    const SEND_TO_RE = /^["']?<<SEND_TO:([^>\r\n]+?)>>\s*([^\r\n]+)$/;
    // CLI permission/approval prompts (Claude Code, inquirer, etc.)
    const AWAITING_PATTERNS = [
      /Do you want to/i,
      /\(y\/n\)/i,
      /\[Y\/n\]/i,
      /\[y\/N\]/i,
      /Confirm/i,
      /Allow .+ tool/i,
    ];
    const lines = rawData.split("\n");
    const broadcasts: string[] = [];
    const approvals: string[] = [];
    const dispatches: { targetLabel: string; command: string }[] = [];
    const cleanLines: string[] = [];
    let awaitingDetected = false;

    for (const line of lines) {
      const stripped = stripAnsi(line).replace(/\r$/, "").trim();

      const broadcastMatch = stripped.match(BROADCAST_RE);
      if (broadcastMatch) {
        broadcasts.push(broadcastMatch[1].trim());
        continue;
      }

      const approvalMatch = stripped.match(APPROVAL_RE);
      if (approvalMatch) {
        approvals.push(approvalMatch[1].trim());
        continue;
      }

      const sendToMatch = stripped.match(SEND_TO_RE);
      if (sendToMatch) {
        const command = this.sanitizeDispatchCommand(sendToMatch[2]);
        if (command.length > 0) {
          dispatches.push({ targetLabel: sendToMatch[1].trim(), command });
          continue;
        }
      }

      if (!awaitingDetected) {
        for (const pat of AWAITING_PATTERNS) {
          if (pat.test(stripped)) { awaitingDetected = true; break; }
        }
      }

      cleanLines.push(line);
    }

    return { cleanData: cleanLines.join("\n"), broadcasts, approvals, dispatches, awaitingDetected };
  }

  // -----------------------------------------------------------------------
  // Internal: flush buffered output to renderer
  // -----------------------------------------------------------------------

  private flush(id: string, instance: PtyInstance): void {
    this.clearTimers(instance);

    if (instance.flushBuffer.length === 0) return;

    const combined = Buffer.concat(instance.flushBuffer);
    instance.flushBuffer = [];

    this.win?.webContents.send(`pty-output-${id}`, Array.from(combined));
  }

  private clearTimers(instance: PtyInstance): void {
    if (instance.coalesceTimer !== null) {
      clearTimeout(instance.coalesceTimer);
      instance.coalesceTimer = null;
    }
    if (instance.maxWaitTimer !== null) {
      clearTimeout(instance.maxWaitTimer);
      instance.maxWaitTimer = null;
    }
    if (instance.idleTimer !== null) {
      clearTimeout(instance.idleTimer);
      instance.idleTimer = null;
    }
  }

  /** Emit terminal status change to frontend + native OS notification when unfocused. */
  private emitStatus(ptyId: string, status: string): void {
    const instance = this.instances.get(ptyId);
    const label = instance?.label ?? "Terminal";
    this.win?.webContents.send(`pty-status-${ptyId}`, { ptyId, status, label });
    log.info(`[PtyService] status: ${label} (${ptyId.slice(0, 8)}) -> ${status}`);

    // Native notification when window is not focused (minimized/background)
    if (this.win && !this.win.isFocused() && Notification.isSupported()) {
      if (status === "idle") {
        new Notification({ title: "Tarefa Concluida", body: `Agente "${label}" concluiu a tarefa.` }).show();
      } else if (status === "awaiting_approval") {
        new Notification({ title: "Aprovacao Necessaria", body: `Agente "${label}" precisa de aprovacao.` }).show();
      }
    }
  }

  /** Reset status to active when user provides input (keystroke, approval, etc.) */
  private resetStatusOnInput(id: string): void {
    const instance = this.instances.get(id);
    if (!instance) return;
    if (instance.currentStatus === "active") return;

    if (instance.idleTimer !== null) {
      clearTimeout(instance.idleTimer);
      instance.idleTimer = null;
    }
    instance.currentStatus = "active";
    this.emitStatus(id, "active");
  }

  private cleanup(id: string): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    this.clearTimers(instance);
    this.instances.delete(id);
  }
}

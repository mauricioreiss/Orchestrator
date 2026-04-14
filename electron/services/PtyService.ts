import type { BrowserWindow } from "electron";
import * as pty from "node-pty";
import { v4 as uuidv4 } from "uuid";
import stripAnsi from "strip-ansi";
import type { PtyInfo } from "../types";

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
}

// ---------------------------------------------------------------------------
// PtyService
// ---------------------------------------------------------------------------

const COALESCE_MS = 16; // ~60fps batch window
const MAX_WAIT_MS = 150; // forced flush ceiling

export class PtyService {
  private win: BrowserWindow | null = null;
  private instances = new Map<string, PtyInstance>();
  /** Tracks last piped output hash per "sourceId:targetId" to skip unchanged data. */
  private pipeHashes = new Map<string, string>();

  /** Store the BrowserWindow reference used for webContents.send. */
  setWindow(win: BrowserWindow): void {
    this.win = win;
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

    // Windows: COMSPEC (cmd.exe) is the safest default; fallback to powershell
    const shell =
      process.platform === "win32"
        ? process.env.COMSPEC || "powershell.exe"
        : process.env.SHELL || "bash";
    const shellArgs: string[] = [];
    if (process.platform === "win32" && shell.toLowerCase().includes("powershell")) {
      shellArgs.push("-NoLogo", "-NoProfile");
    }

    const proc = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: cwd ?? process.env.HOME ?? process.env.USERPROFILE ?? ".",
      env: process.env as Record<string, string>,
      // Disable conpty to avoid AttachConsole crashes from conpty_console_list
      useConpty: false,
    } as pty.IPtyForkOptions & { useConpty?: boolean });

    const instance: PtyInstance = {
      process: proc,
      label: resolvedLabel,
      ringBuffer: new RingBuffer(),
      flushBuffer: [],
      coalesceTimer: null,
      maxWaitTimer: null,
    };

    this.instances.set(id, instance);

    // --- Output handler: push to ring buffer + schedule flush ---
    proc.onData((data: string) => {
      const chunk = Buffer.from(data, "utf-8");
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
      console.warn(`[PtyService] error killing PTY ${id}:`, e);
    }
    this.cleanup(id);
  }

  killAll(): void {
    for (const [id, instance] of this.instances) {
      try {
        instance.process.kill();
      } catch (e) {
        console.warn(`[PtyService] error killing PTY ${id}:`, e);
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
  }

  private cleanup(id: string): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    this.clearTimers(instance);
    this.instances.delete(id);
  }
}

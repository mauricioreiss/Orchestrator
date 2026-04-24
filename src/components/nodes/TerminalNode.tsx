import { memo, useRef, useEffect, useCallback, useState } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { toast } from "sonner";
import { invoke, listen, isElectron } from "../../lib/electron";
import { usePty } from "../../hooks/usePty";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import { useShallow } from "zustand/react/shallow";
import type { TerminalNodeData } from "../../types";
import NodeWrapper from "./NodeWrapper";
import "@xterm/xterm/css/xterm.css";

const ROLES = ["Leader", "Coder", "Agent", "CyberSec"] as const;

// Boot queue: staggers concurrent agent boots to prevent race conditions.
// Each boot takes ~8s total. Queue tracks active boots and assigns delay slots.
let bootQueue: Promise<void> = Promise.resolve();
const BOOT_STAGGER_MS = 2000;

const ROLE_BADGE: Record<string, string> = {
  Leader: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Coder: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Agent: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  CyberSec: "bg-red-500/20 text-red-400 border-red-500/30",
};

const ROLE_DOT: Record<string, string> = {
  Leader: "bg-emerald-400",
  Coder: "bg-blue-400",
  Agent: "bg-purple-400",
  CyberSec: "bg-red-400",
};

const ROLE_BORDER: Record<string, string> = {
  Leader: "#10b981",
  Coder: "#3b82f6",
  Agent: "#7c3aed",
  CyberSec: "#ef4444",
};

const HANDLES = [
  { id: "top", type: "target" as const, position: Position.Top },
  { id: "bottom", type: "source" as const, position: Position.Bottom },
  { id: "left", type: "target" as const, position: Position.Left },
  { id: "right", type: "source" as const, position: Position.Right },
];

function TerminalNode({ id, data, selected, parentId }: NodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeData = data as TerminalNodeData;
  const label = nodeData.label ?? "Terminal";
  const role = nodeData.role ?? "Agent";

  const hibernatedGroups = useCanvasStore(useShallow((s) => s.hibernatedGroups));
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const { ptyId, connected } = usePty({
    containerRef,
    cwd: nodeData.cwd,
    label,
    disabled: isHibernated,
  });

  const [pipeFlash, setPipeFlash] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [agentState, setAgentState] = useState<"idle" | "booting" | "injecting" | "ready">("idle");
  const autoApprove = (nodeData.autoApprove as boolean | undefined) ?? false;
  const { syncDebounced } = useCanvasSync();
  const { setNodes, getEdges, getNodes } = useReactFlow();

  // Propagate ptyId back to node data
  useEffect(() => {
    if (ptyId && ptyId !== nodeData.ptyId) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ptyId } } : n,
        ),
      );
    }
  }, [ptyId, id, nodeData.ptyId, setNodes]);

  // Live directory change: when data.cwd mutates after mount (e.g. via Deep
  // CWD cascade), issue a real `cd "<path>"` into the live shell. The
  // PTY spawned with the initial cwd, so we skip the first equality check.
  const prevCwdRef = useRef<string | undefined>(nodeData.cwd);
  useEffect(() => {
    if (!isElectron()) return;
    if (!ptyId) return;
    if (!nodeData.cwd) return;
    if (prevCwdRef.current === nodeData.cwd) return;

    prevCwdRef.current = nodeData.cwd;

    const cdBytes = Array.from(
      new TextEncoder().encode(`cd "${nodeData.cwd}"\r`),
    );
    invoke("write_pty", { id: ptyId, data: cdBytes }).catch((err) =>
      console.error("[TerminalNode] live cd failed:", err),
    );

    const clsBytes = Array.from(new TextEncoder().encode("cls\r"));
    const clearTimer = setTimeout(() => {
      invoke("write_pty", { id: ptyId, data: clsBytes }).catch((err) =>
        console.error("[TerminalNode] cls failed:", err),
      );
    }, 120);

    return () => clearTimeout(clearTimer);
  }, [nodeData.cwd, ptyId]);

  const hasSourceTerminals = useCallback(() => {
    const edges = getEdges();
    const nodes = getNodes();
    return edges.some(
      (e) => e.target === id && nodes.find((n) => n.id === e.source)?.type === "terminal",
    );
  }, [id, getEdges, getNodes]);

  const handlePipe = useCallback(async () => {
    if (!ptyId) return;
    const edges = getEdges();
    const nodes = getNodes();
    const sourceEdges = edges.filter(
      (e) => e.target === id && nodes.find((n) => n.id === e.source)?.type === "terminal",
    );
    if (!isElectron()) return;
    let piped = 0;
    for (const edge of sourceEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const sourcePtyId = (sourceNode?.data as TerminalNodeData)?.ptyId;
      if (sourcePtyId) {
        try {
          const bytes = await invoke<number>("pipe_pty_output", {
            sourceId: sourcePtyId,
            targetId: ptyId,
          });
          piped += bytes;
        } catch (e) {
          console.error("pipe failed:", e);
        }
      }
    }
    if (piped > 0) {
      setPipeFlash(true);
      setTimeout(() => setPipeFlash(false), 600);
    }
  }, [ptyId, id, getEdges, getNodes]);

  const handleRoleChange = useCallback(
    (newRole: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, role: newRole } } : n,
        ),
      );
      setRoleOpen(false);
      syncDebounced();
    },
    [id, setNodes, syncDebounced],
  );

  // PTY status monitoring: approval prompts, idle detection
  const [ptyStatus, setPtyStatus] = useState<"active" | "awaiting_approval" | "idle">("active");

  useEffect(() => {
    if (!ptyId || !isElectron()) return;
    const unlisten = listen<{ ptyId: string; status: string; label: string }>(
      `pty-status-${ptyId}`,
      ({ status }) => {
        setPtyStatus(status as "active" | "awaiting_approval" | "idle");
        if (status === "awaiting_approval") {
          toast.warning(`Terminal "${label}" pede aprovacao.`, {
            id: `approval-${ptyId}`,
            duration: Infinity,
            closeButton: true,
          });
        } else {
          // Dismiss persistent approval toast when status changes away
          toast.dismiss(`approval-${ptyId}`);
        }
        if (status === "idle") {
          toast.success(`Terminal "${label}" concluiu a tarefa.`, { duration: 4000 });
        }
      },
    );
    return unlisten;
  }, [ptyId, label]);

  // Green glow auto-reset: idle border reverts to normal after 5s
  useEffect(() => {
    if (ptyStatus !== "idle") return;
    const timer = setTimeout(() => setPtyStatus("active"), 5000);
    return () => clearTimeout(timer);
  }, [ptyStatus]);

  const handleToggleAutoApprove = useCallback(() => {
    const next = !autoApprove;
    if (next) {
      toast.warning(
        "Auto-Approve ativado: o agente tera permissoes irrestritas neste terminal.",
        { duration: 5000 },
      );
    }
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, autoApprove: next } } : n,
      ),
    );
    syncDebounced();
  }, [id, autoApprove, setNodes, syncDebounced]);

  const handleStartAgent = useCallback(async () => {
    if (!ptyId || agentState !== "idle") return;
    const capturedPtyId = ptyId;
    const personaFile = label.toLowerCase().replace(/\s+/g, "_") + "_persona.md";

    setAgentState("booting");
    toast.info(`Iniciando Claude CLI em "${label}"...`);

    // Helper: write bytes and wait for IPC confirmation
    const writePty = (data: number[]) =>
      invoke("write_pty", { id: capturedPtyId, data });

    // Helper: sleep
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // Raw carriage return (char 13) — simulates physical Enter keypress
    const forceEnter = Array.from(new TextEncoder().encode(String.fromCharCode(13)));

    // Queue this boot behind any active boots to prevent race conditions
    const myBoot = bootQueue.then(async () => {
      try {
        // Step 1: Write boot command (with --dangerously-skip-permissions if Auto is on)
        const bootCmd = autoApprove ? "claude --dangerously-skip-permissions" : "claude";
        const bootText = Array.from(new TextEncoder().encode(bootCmd));
        await writePty(bootText);
        console.log(`[Auto-Ignition] Boot text sent to ptyId=${capturedPtyId} label="${label}"`);

        // Step 2: Wait 500ms, then send CR(13) to execute
        await sleep(500);
        await writePty(forceEnter);
        console.log(`[Force Enter] Boot CR(13) confirmed for ptyId=${capturedPtyId} label="${label}"`);

        // Step 3: Wait 6s for CLI to fully initialize
        await sleep(6000);
        setAgentState("injecting");

        // Step 4: Write persona prompt text
        const prompt = `Leia o arquivo ${personaFile} na raiz do projeto. Incorpore essas regras como sua persona e confirme quando estiver pronto para receber ordens.`;
        const promptBytes = Array.from(new TextEncoder().encode(prompt));
        await writePty(promptBytes);
        console.log(`[Auto-Ignition] Prompt text sent to ptyId=${capturedPtyId} label="${label}"`);

        // Step 5: Wait 500ms, then send CR(13) to execute
        await sleep(500);
        await writePty(forceEnter);
        console.log(`[Force Enter] Inject CR(13) confirmed for ptyId=${capturedPtyId} label="${label}"`);

        setAgentState("ready");
        toast.success(`Persona injetada: ${personaFile}`);
        await sleep(3000);
        setAgentState("idle");
      } catch (err) {
        console.error(`[TerminalNode] agent boot failed for "${label}":`, err);
        toast.error(`Falha ao iniciar agente: ${label}`);
        setAgentState("idle");
      }

      // Stagger: give next boot in queue breathing room
      await sleep(BOOT_STAGGER_MS);
    });

    bootQueue = myBoot;
  }, [ptyId, label, agentState, autoApprove]);

  const borderColor = ROLE_BORDER[role] ?? ROLE_BORDER.Agent;
  const badgeClass = ROLE_BADGE[role] ?? ROLE_BADGE.Agent;

  // Dynamic border based on PTY status
  const statusBorderOverride = ptyStatus === "awaiting_approval"
    ? "#f59e0b"
    : ptyStatus === "idle"
      ? "#10b981"
      : undefined;

  const statusIndicator = ptyStatus === "awaiting_approval"
    ? <span className="text-amber-400 text-xs animate-pulse" title="Aguardando aprovacao">&#9888;</span>
    : ptyStatus === "idle"
      ? <span className="text-emerald-400 text-xs" title="Tarefa concluida">&#10003;</span>
      : null;

  const roleBadge = (
    <div className="relative nodrag">
      <button
        onClick={() => setRoleOpen(!roleOpen)}
        className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${badgeClass}`}
      >
        {role}
      </button>
      {roleOpen && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden"
          style={{ background: "var(--mx-surface)", border: "1px solid var(--mx-border-strong)" }}
        >
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => handleRoleChange(r)}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-[11px] transition-colors"
              style={{ color: r === role ? "var(--mx-text)" : "var(--mx-text-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-surface-alt)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span className={`w-2 h-2 rounded-full ${ROLE_DOT[r]}`} />
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const statusDot = (
    <div
      className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
      title={connected ? "Connected" : "Disconnected"}
    />
  );

  // Web-only placeholder
  if (!isElectron()) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={borderColor}
        minWidth={350}
        minHeight={250}
        label={label}
        badges={<><span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${badgeClass}`}>{role}</span></>}
        statusLeft="web preview"
        handles={HANDLES}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: "var(--mx-text-muted)" }}>
            <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 8l3 3-3 3M12 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-sm text-center" style={{ color: "var(--mx-text-secondary)" }}>Ambiente Web detectado</p>
          <p className="text-[11px] text-center leading-relaxed max-w-[260px]" style={{ color: "var(--mx-text-muted)" }}>
            Use a versao Desktop do Orchestrated Space para terminais interativos.
          </p>
        </div>
      </NodeWrapper>
    );
  }

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={borderColor}
        minWidth={350}
        minHeight={250}
        label={label}
        badges={<span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${badgeClass}`}>{role}</span>}
        statusLeft="sleeping"
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--mx-text-muted)" }}>
              <path d="M21 15.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10.5M12 8v4M8 21h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-sm" style={{ color: "var(--mx-text-muted)" }}>Hibernated</span>
          </div>
        </div>
      </NodeWrapper>
    );
  }

  const agentButtonLabel = agentState === "booting" ? "Acordando..."
    : agentState === "injecting" ? "Injetando..."
    : agentState === "ready" ? "Pronto!"
    : "Agent";
  const agentBusy = agentState !== "idle";
  const autoToggle = ptyId && connected ? (
    <button
      onClick={handleToggleAutoApprove}
      className={`px-1.5 py-0.5 text-[10px] rounded transition-colors nodrag ${
        autoApprove
          ? "text-amber-400 bg-amber-500/10"
          : "text-zinc-500 hover:text-zinc-400 hover:bg-zinc-500/10"
      }`}
      title={autoApprove ? "Auto-Approve LIGADO: --dangerously-skip-permissions" : "Auto-Approve DESLIGADO: modo normal com permissoes"}
    >
      Auto
    </button>
  ) : null;

  const agentButton = ptyId && connected ? (
    <button
      onClick={handleStartAgent}
      disabled={agentBusy}
      className={`px-1.5 py-0.5 text-[10px] rounded transition-colors nodrag ${
        agentState === "ready"
          ? "text-emerald-400"
          : agentBusy
            ? "text-amber-400 animate-pulse"
            : "text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
      }`}
      style={{ cursor: agentBusy ? "not-allowed" : "pointer" }}
      title={agentBusy ? agentButtonLabel : `Auto-Ignicao: inicia Claude CLI e injeta ${label.toLowerCase().replace(/\s+/g, "_")}_persona.md`}
    >
      {agentButtonLabel}
    </button>
  ) : null;

  const pipeButton = hasSourceTerminals() && ptyId ? (
    <button
      onClick={handlePipe}
      className="px-1.5 py-0.5 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors nodrag"
      title="Pipe output from connected terminals"
    >
      Pipe
    </button>
  ) : null;

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={borderColor}
      borderOverride={pipeFlash ? "#10b981" : statusBorderOverride}
      minWidth={350}
      minHeight={250}
      label={label}
      titleBarExtra={<>{autoToggle}{agentButton}{pipeButton}</>}
      badges={<>{roleBadge}{statusIndicator}{statusDot}</>}
      statusLeft={connected ? "pwsh" : "disconnected"}
      statusRight={ptyId ? <span className="font-mono">{ptyId.slice(0, 8)}</span> : undefined}
      handles={HANDLES}
    >
      <div
        ref={containerRef}
        className="flex-1 min-h-0 nodrag nowheel"
        style={{ cursor: "text" }}
      />
    </NodeWrapper>
  );
}

export default memo(TerminalNode);

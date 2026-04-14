import { memo, useRef, useEffect, useCallback, useState } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { invoke } from "../../lib/electron";
import { isElectron } from "../../lib/electron";
import { usePty } from "../../hooks/usePty";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import type { TerminalNodeData } from "../../types";
import NodeWrapper from "./NodeWrapper";
import "@xterm/xterm/css/xterm.css";

const ROLES = ["Leader", "Coder", "Agent", "CyberSec"] as const;

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
  { type: "target" as const, position: Position.Left },
  { type: "source" as const, position: Position.Right },
];

function TerminalNode({ id, data, selected, parentId }: NodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeData = data as TerminalNodeData;
  const label = nodeData.label ?? "Terminal";
  const role = nodeData.role ?? "Agent";

  const hibernatedGroups = useCanvasStore((s) => s.hibernatedGroups);
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const { ptyId, connected } = usePty({
    containerRef,
    cwd: nodeData.cwd,
    label,
    disabled: isHibernated,
  });

  const [pipeFlash, setPipeFlash] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
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

  const borderColor = ROLE_BORDER[role] ?? ROLE_BORDER.Agent;
  const badgeClass = ROLE_BADGE[role] ?? ROLE_BADGE.Agent;

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
            Use a versao Desktop do Maestri-X para terminais interativos.
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
      borderOverride={pipeFlash ? "#10b981" : undefined}
      minWidth={350}
      minHeight={250}
      label={label}
      titleBarExtra={pipeButton}
      badges={<>{roleBadge}{statusDot}</>}
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

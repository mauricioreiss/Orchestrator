import { memo, useState, useEffect, useMemo } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useCanvasStore } from "../../store/canvasStore";
import { useShallow } from "zustand/react/shallow";
import { listen, isElectron } from "../../lib/electron";
import type { GlobalMonitorNodeData, TerminalNodeData } from "../../types";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#06b6d4";

const HANDLES = [
  { id: "top", type: "target" as const, position: Position.Top },
  { id: "bottom", type: "source" as const, position: Position.Bottom },
  { id: "left", type: "target" as const, position: Position.Left },
  { id: "right", type: "source" as const, position: Position.Right },
];

const STATUS_COLORS: Record<string, string> = {
  active: "#10b981",
  awaiting_approval: "#f59e0b",
  idle: "#64748b",
  disconnected: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  awaiting_approval: "Aguardando",
  idle: "Idle",
  disconnected: "Offline",
};

interface TerminalEntry {
  nodeId: string;
  label: string;
  ptyId: string | undefined;
  role: string;
}

function GlobalMonitorNodeInner({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as GlobalMonitorNodeData;
  const label = nodeData.label ?? "Monitor";

  const hibernatedGroups = useCanvasStore(useShallow((s) => s.hibernatedGroups));
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const { fitView } = useReactFlow();

  // Read all terminal nodes from canvas store
  const terminals = useCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type === "terminal")),
  );

  const terminalList: TerminalEntry[] = useMemo(
    () =>
      terminals.map((t) => {
        const td = t.data as TerminalNodeData;
        return {
          nodeId: t.id,
          label: td.label ?? "Terminal",
          ptyId: td.ptyId,
          role: td.role ?? "Agent",
        };
      }),
    [terminals],
  );

  // Serialize ptyIds for effect dependency
  const ptyIdKey = useMemo(
    () => terminalList.map((t) => t.ptyId ?? "").join(","),
    [terminalList],
  );

  // Status map: ptyId -> status string
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  // Listen for pty-status events for each terminal
  useEffect(() => {
    if (!isElectron()) return;
    const unlisteners: (() => void)[] = [];
    for (const term of terminalList) {
      if (!term.ptyId) continue;
      const unlisten = listen<{ ptyId: string; status: string }>(
        `pty-status-${term.ptyId}`,
        ({ ptyId, status }) => {
          setStatusMap((prev) => ({ ...prev, [ptyId]: status }));
        },
      );
      unlisteners.push(unlisten);
    }
    return () => unlisteners.forEach((fn) => fn());
  }, [ptyIdKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigate = (nodeId: string) => {
    fitView({ nodes: [{ id: nodeId }], duration: 600, padding: 0.3 });
  };

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={350}
        minHeight={250}
        label={label}
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm" style={{ color: "var(--mx-text-muted)" }}>Hibernated</span>
        </div>
      </NodeWrapper>
    );
  }

  const activeCount = terminalList.filter((t) => {
    const st = t.ptyId ? statusMap[t.ptyId] ?? "active" : "disconnected";
    return st === "active";
  }).length;

  const awaitingCount = terminalList.filter((t) => {
    const st = t.ptyId ? statusMap[t.ptyId] ?? "active" : "disconnected";
    return st === "awaiting_approval";
  }).length;

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={BORDER_COLOR}
      minWidth={350}
      minHeight={250}
      label={label}
      badges={
        <span
          className="px-2 py-0.5 text-[10px] font-semibold rounded-full border"
          style={{
            background: "rgba(6, 182, 212, 0.15)",
            color: "#06b6d4",
            borderColor: "rgba(6, 182, 212, 0.3)",
          }}
        >
          {terminalList.length} terminais
        </span>
      }
      statusLeft={
        <span className="flex items-center gap-2">
          <span className="text-emerald-400">{activeCount} ativos</span>
          {awaitingCount > 0 && (
            <span className="text-amber-400">{awaitingCount} aguardando</span>
          )}
        </span>
      }
      handles={HANDLES}
    >
      <div className="flex-1 min-h-0 overflow-auto nodrag nowheel">
        {terminalList.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-sm text-center" style={{ color: "var(--mx-text-muted)" }}>
              Nenhum terminal no canvas.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {terminalList.map((term) => {
              const status = term.ptyId
                ? statusMap[term.ptyId] ?? "active"
                : "disconnected";
              const dotColor = STATUS_COLORS[status] ?? STATUS_COLORS.disconnected;
              const statusLabel = STATUS_LABELS[status] ?? status;

              return (
                <button
                  key={term.nodeId}
                  onClick={() => handleNavigate(term.nodeId)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left w-full group"
                  style={{ color: "var(--mx-text)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-sidebar-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Status dot */}
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${status === "awaiting_approval" ? "animate-pulse" : ""}`}
                    style={{ background: dotColor }}
                  />

                  {/* Label + role */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{term.label}</div>
                    <div className="text-[10px]" style={{ color: "var(--mx-text-muted)" }}>
                      {term.role} · {statusLabel}
                    </div>
                  </div>

                  {/* PTY ID short */}
                  {term.ptyId && (
                    <span
                      className="text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "var(--mx-text-muted)" }}
                    >
                      {term.ptyId.slice(0, 6)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

export default memo(GlobalMonitorNodeInner);

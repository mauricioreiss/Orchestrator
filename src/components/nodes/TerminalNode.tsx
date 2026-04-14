import { memo, useRef, useEffect, useCallback, useState } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../../lib/tauri";
import { usePty } from "../../hooks/usePty";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import type { TerminalNodeData } from "../../types";
import "@xterm/xterm/css/xterm.css";

const ROLES = ["Leader", "Coder", "Agent", "CyberSec"] as const;

const ROLE_DOT_COLORS: Record<string, string> = {
  Leader: "bg-emerald-400",
  Coder: "bg-blue-400",
  Agent: "bg-purple-400",
  CyberSec: "bg-red-400",
};

const ROLE_COLORS: Record<string, string> = {
  Leader: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Coder: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Agent: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  CyberSec: "bg-red-500/20 text-red-400 border-red-500/30",
};

const NODE_BORDER_COLORS: Record<string, string> = {
  Leader: "#10b981",
  Coder: "#3b82f6",
  Agent: "#7c3aed",
  CyberSec: "#ef4444",
};

function TerminalNode({ id, data, selected, parentId }: NodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeData = data as TerminalNodeData;

  const label = nodeData.label ?? "Terminal";
  const role = nodeData.role ?? "Agent";

  const hibernatedGroups = useCanvasStore((s) => s.hibernatedGroups);
  const isHibernated = parentId
    ? hibernatedGroups.includes(parentId as string)
    : false;

  const { ptyId, connected } = usePty({
    containerRef,
    cwd: nodeData.cwd,
    label,
    disabled: isHibernated,
  });

  const [pipeFlash, setPipeFlash] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const { syncDebounced } = useCanvasSync();

  // Propagate ptyId back to node data so sync_canvas can match PTY <-> node
  const { setNodes, getEdges, getNodes } = useReactFlow();
  useEffect(() => {
    if (ptyId && ptyId !== nodeData.ptyId) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ptyId } } : n,
        ),
      );
    }
  }, [ptyId, id, nodeData.ptyId, setNodes]);

  // Check if any terminal is connected as source to this terminal
  const hasSourceTerminals = useCallback(() => {
    const edges = getEdges();
    const nodes = getNodes();
    return edges.some(
      (e) =>
        e.target === id &&
        nodes.find((n) => n.id === e.source)?.type === "terminal",
    );
  }, [id, getEdges, getNodes]);

  // Pipe output from all source terminals into this one
  const handlePipe = useCallback(async () => {
    if (!ptyId) return;
    const edges = getEdges();
    const nodes = getNodes();

    const sourceEdges = edges.filter(
      (e) =>
        e.target === id &&
        nodes.find((n) => n.id === e.source)?.type === "terminal",
    );

    if (!isTauri()) return;

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

  const badgeClass = ROLE_COLORS[role] ?? ROLE_COLORS.Agent;
  const borderColor = NODE_BORDER_COLORS[role] ?? NODE_BORDER_COLORS.Agent;
  const effectiveBorder = pipeFlash ? "#10b981" : borderColor;

  // Web-only placeholder
  if (!isTauri()) {
    return (
      <>
        <NodeResizer
          isVisible={selected}
          minWidth={350}
          minHeight={250}
          lineStyle={{ borderColor }}
          handleStyle={{ width: 10, height: 10, backgroundColor: borderColor, borderColor }}
        />
        <div
          className="flex flex-col h-full rounded-lg overflow-hidden shadow-2xl"
          style={{
            border: `1px solid ${selected ? borderColor : "rgba(49,50,68,0.5)"}`,
            background: "rgba(24,24,37,0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b]/80 border-b border-[#313244]/50 select-none cursor-grab active:cursor-grabbing">
            <span className="text-sm font-medium text-[#cdd6f4] truncate max-w-[200px]">{label}</span>
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${badgeClass}`}>{role}</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[#6c7086]">
              <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 8l3 3-3 3M12 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm text-[#a6adc8] text-center">Ambiente Web detectado</p>
            <p className="text-[11px] text-[#6c7086] text-center leading-relaxed max-w-[260px]">
              Use a versao Desktop do Maestri-X para terminais interativos.
            </p>
          </div>
          <div className="flex items-center px-3 py-1 bg-[#11111b]/80 border-t border-[#313244]/50 select-none">
            <span className="text-[10px] text-[#6c7086]">web preview</span>
          </div>
        </div>
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-mx-accent !border-2 !border-[#181825]" />
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-mx-accent !border-2 !border-[#181825]" />
      </>
    );
  }

  if (isHibernated) {
    return (
      <>
        <NodeResizer
          isVisible={selected}
          minWidth={350}
          minHeight={250}
          lineStyle={{ borderColor }}
          handleStyle={{
            width: 10,
            height: 10,
            backgroundColor: borderColor,
            borderColor,
          }}
        />
        <div
          className="flex flex-col h-full rounded-lg overflow-hidden shadow-2xl"
          style={{
            border: `1px solid ${selected ? borderColor : "rgba(49,50,68,0.5)"}`,
            background: "rgba(24,24,37,0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b]/80 border-b border-[#313244]/50 select-none cursor-grab active:cursor-grabbing">
            <span className="text-sm font-medium text-[#6c7086] truncate max-w-[200px]">
              {label}
            </span>
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${badgeClass}`}>
              {role}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#6c7086]">
                <path d="M21 15.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10.5M12 8v4M8 21h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-[#6c7086] text-sm">Hibernated</span>
            </div>
          </div>
          <div className="flex items-center px-3 py-1 bg-[#11111b]/80 border-t border-[#313244]/50 select-none">
            <span className="text-[10px] text-[#6c7086]">sleeping</span>
          </div>
        </div>
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-mx-accent !border-2 !border-[#181825]"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-mx-accent !border-2 !border-[#181825]"
        />
      </>
    );
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={350}
        minHeight={250}
        lineStyle={{ borderColor: effectiveBorder }}
        handleStyle={{
          width: 10,
          height: 10,
          backgroundColor: effectiveBorder,
          borderColor: effectiveBorder,
        }}
      />

      <div
        className="flex flex-col h-full rounded-lg overflow-hidden shadow-2xl"
        style={{
          border: `1px solid ${selected || pipeFlash ? effectiveBorder : "rgba(49,50,68,0.5)"}`,
          background: "rgba(24,24,37,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow:
            selected || pipeFlash
              ? `0 0 20px ${effectiveBorder}33, 0 8px 32px rgba(0,0,0,0.3)`
              : "0 8px 32px rgba(0,0,0,0.2)",
          transition: "border-color 0.3s, box-shadow 0.3s",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b]/80 border-b border-[#313244]/50 select-none cursor-grab active:cursor-grabbing">
          <span className="text-sm font-medium text-[#cdd6f4] truncate max-w-[200px]">
            {label}
          </span>
          <div className="flex items-center gap-2">
            {hasSourceTerminals() && ptyId && (
              <button
                onClick={handlePipe}
                className="px-1.5 py-0.5 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors nodrag"
                title="Pipe output from connected terminals"
              >
                Pipe
              </button>
            )}
            <div className="relative nodrag">
              <button
                onClick={() => setRoleOpen(!roleOpen)}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${badgeClass}`}
              >
                {role}
              </button>
              {roleOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden"
                  style={{ background: "rgba(30,30,46,0.95)", border: "1px solid #313244" }}>
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRoleChange(r)}
                      className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#313244] transition-colors ${
                        r === role ? "text-white font-semibold" : "text-[#cdd6f4]"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${ROLE_DOT_COLORS[r]}`} />
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div
              className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
              title={connected ? "Connected" : "Disconnected"}
            />
          </div>
        </div>

        {/* Terminal - nodrag/nowheel prevent React Flow from hijacking events */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 nodrag nowheel"
          style={{ cursor: "text" }}
        />

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-[#11111b]/80 border-t border-[#313244]/50 select-none">
          <span className="text-[10px] text-[#6c7086]">
            {connected ? "pwsh" : "disconnected"}
          </span>
          {ptyId && (
            <span className="text-[10px] text-[#6c7086] font-mono">
              {ptyId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>

      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-mx-accent !border-2 !border-[#181825]"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-mx-accent !border-2 !border-[#181825]"
      />
    </>
  );
}

export default memo(TerminalNode);

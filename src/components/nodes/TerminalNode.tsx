import { memo, useRef } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import { usePty } from "../../hooks/usePty";
import "@xterm/xterm/css/xterm.css";

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

function TerminalNode({ data, selected }: NodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeData = data as { label?: string; role?: string; cwd?: string };

  const label = nodeData.label ?? "Terminal";
  const role = nodeData.role ?? "Agent";

  const { ptyId, connected } = usePty({
    containerRef,
    cwd: nodeData.cwd,
    label,
  });

  const badgeClass = ROLE_COLORS[role] ?? ROLE_COLORS.Agent;
  const borderColor = NODE_BORDER_COLORS[role] ?? NODE_BORDER_COLORS.Agent;

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
          border: `1px solid ${selected ? borderColor : "#313244"}`,
          background: "#181825",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b] border-b border-[#313244] select-none cursor-grab active:cursor-grabbing">
          <span className="text-sm font-medium text-[#cdd6f4] truncate max-w-[200px]">
            {label}
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${badgeClass}`}
            >
              {role}
            </span>
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
        <div className="flex items-center justify-between px-3 py-1 bg-[#11111b] border-t border-[#313244] select-none">
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

      {/* Connection handles for data pipes (Phase 4) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-shark-accent !border-2 !border-[#181825]"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-shark-accent !border-2 !border-[#181825]"
      />
    </>
  );
}

export default memo(TerminalNode);

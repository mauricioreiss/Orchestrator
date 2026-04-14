import { memo, useState, useCallback, useRef, useEffect } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  useEdges,
  type NodeProps,
} from "@xyflow/react";
import type { NoteNodeData, TerminalNodeData } from "../../types";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useTranslator, type TranslatorStatus } from "../../hooks/useTranslator";
import { useCanvasStore } from "../../store/canvasStore";

const BORDER_COLOR = "#f59e0b";
const CONTENT_DEBOUNCE_MS = 300;

function NoteNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NoteNodeData;
  const label = nodeData.label ?? "Note";
  const priority = nodeData.priority ?? 1;
  const commandMode = nodeData.commandMode ?? false;

  const [content, setContent] = useState(nodeData.content ?? "");
  const { setNodes, getNode } = useReactFlow();
  const edges = useEdges();
  const { syncDebounced } = useCanvasSync();
  const { status, lastCommand, error, translate } = useTranslator();
  const setEdges = useCanvasStore((s) => s.setEdges);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Propagate content changes to React Flow node data (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, content } } : n,
        ),
      );
      syncDebounced();
    }, CONTENT_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, id, setNodes, syncDebounced]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
    },
    [],
  );

  const toggleCommandMode = useCallback(() => {
    const newMode = !commandMode;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, commandMode: newMode } }
          : n,
      ),
    );
    syncDebounced();
  }, [id, commandMode, setNodes, syncDebounced]);

  // Update edge status for visual feedback
  const setEdgeStatus = useCallback(
    (edgeStatus: string) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.source === id
            ? { ...e, data: { ...e.data, status: edgeStatus } }
            : e,
        ),
      );
    },
    [id, setEdges],
  );

  // Find the connected terminal and execute translation
  const handleExecute = useCallback(async () => {
    const noteEdge = edges.find((e) => e.source === id);
    if (!noteEdge) return;

    const targetNode = getNode(noteEdge.target);
    if (!targetNode || targetNode.type !== "terminal") return;

    const termData = targetNode.data as TerminalNodeData;
    if (!termData.ptyId) return;

    // Set edge to "translating" state
    setEdgeStatus("translating");

    const result = await translate(
      content,
      termData.ptyId,
      termData.cwd ?? ".",
      termData.role ?? "Agent",
    );

    // Update edge status based on result
    setEdgeStatus(result ? "success" : "error");
    // Reset edge after 3s
    setTimeout(() => setEdgeStatus("idle"), 3000);
  }, [id, edges, getNode, content, translate, setEdgeStatus]);

  const statusIcon = getStatusIcon(status);
  const borderColor = commandMode ? "#7c3aed" : BORDER_COLOR;

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={300}
        minHeight={200}
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
          boxShadow: selected
            ? `0 0 20px ${borderColor}33, 0 8px 32px rgba(0,0,0,0.3)`
            : "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b]/80 border-b border-[#313244]/50 select-none cursor-grab active:cursor-grabbing">
          <span className="text-sm font-medium text-[#cdd6f4] truncate max-w-[140px]">
            {label}
          </span>
          <div className="flex items-center gap-2">
            {/* Command mode toggle */}
            <button
              onClick={toggleCommandMode}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border transition-colors nodrag ${
                commandMode
                  ? "bg-violet-500/30 text-violet-300 border-violet-500/50"
                  : "bg-amber-500/20 text-amber-400 border-amber-500/30"
              }`}
              title={commandMode ? "Command mode (AI translates)" : "Text mode (inject as-is)"}
            >
              {commandMode ? "CMD" : "TXT"}
            </button>
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-amber-500/20 text-amber-400 border-amber-500/30">
              P{priority}
            </span>
          </div>
        </div>

        {/* Content area */}
        <textarea
          className="flex-1 min-h-0 w-full bg-transparent text-[#cdd6f4] text-sm p-3 resize-none outline-none placeholder-[#6c7086] nodrag nowheel"
          value={content}
          onChange={handleChange}
          placeholder={
            commandMode
              ? "Describe what you want the terminal to do..."
              : "System instruction for connected terminals..."
          }
          spellCheck={false}
        />

        {/* Execute button (command mode only) */}
        {commandMode && (
          <div className="px-3 py-2 border-t border-[#313244]/50">
            <button
              onClick={handleExecute}
              disabled={status === "translating" || !content.trim()}
              className={`w-full py-1.5 rounded text-sm font-semibold transition-all nodrag ${
                status === "translating"
                  ? "bg-violet-500/20 text-violet-300 cursor-wait"
                  : status === "error"
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : status === "success"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-violet-500/30 text-violet-300 hover:bg-violet-500/40 active:bg-violet-500/50"
              }`}
            >
              {statusIcon}
            </button>
            {/* Last translated command or error */}
            {lastCommand && status === "success" && (
              <div className="mt-1.5 px-2 py-1 rounded bg-[#11111b]/60 text-[10px] text-emerald-400 font-mono truncate">
                {lastCommand}
              </div>
            )}
            {error && status === "error" && (
              <div className="mt-1.5 px-2 py-1 rounded bg-[#11111b]/60 text-[10px] text-red-400 truncate">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-[#11111b]/80 border-t border-[#313244]/50 select-none">
          <span className="text-[10px] text-[#6c7086]">
            {content.length} chars
          </span>
          <span
            className={`text-[10px] ${commandMode ? "text-violet-400/60" : "text-amber-400/60"}`}
          >
            {commandMode ? "command" : "note"}
          </span>
        </div>
      </div>

      {/* Source handle: connects TO terminals */}
      <Handle
        type="source"
        position={Position.Right}
        className={`!w-3 !h-3 !border-2 !border-[#181825] ${
          commandMode ? "!bg-violet-500" : "!bg-amber-500"
        }`}
      />
    </>
  );
}

function getStatusIcon(status: TranslatorStatus): string {
  switch (status) {
    case "translating":
      return "Translating...";
    case "success":
      return "Executed";
    case "error":
      return "Error - Retry";
    default:
      return "EXECUTE";
  }
}

export default memo(NoteNode);

import { memo, useState, useCallback, useRef, useEffect } from "react";
import {
  Position,
  useReactFlow,
  useEdges,
  type NodeProps,
} from "@xyflow/react";
import { invoke } from "../../lib/electron";
import type { NoteNodeData, TerminalNodeData } from "../../types";
import { isElectron } from "../../lib/electron";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#f59e0b";
const CONTENT_DEBOUNCE_MS = 300;

type ExecStatus = "idle" | "sending" | "success" | "error";

function NoteNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NoteNodeData;
  const label = nodeData.label ?? "Note";
  const priority = nodeData.priority ?? 1;
  const commandMode = nodeData.commandMode ?? false;

  const [content, setContent] = useState(nodeData.content ?? "");
  const [execStatus, setExecStatus] = useState<ExecStatus>("idle");
  const [execError, setExecError] = useState<string | null>(null);
  const { setNodes, getNode } = useReactFlow();
  const edges = useEdges();
  const { syncDebounced } = useCanvasSync();
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

  const handleExecute = useCallback(async () => {
    if (!isElectron()) return;
    const noteEdge = edges.find((e) => e.source === id);
    if (!noteEdge) return;
    const targetNode = getNode(noteEdge.target);
    if (!targetNode || targetNode.type !== "terminal") return;
    const termData = targetNode.data as TerminalNodeData;
    if (!termData.ptyId) return;

    setExecStatus("sending");
    setExecError(null);
    setEdgeStatus("translating");

    try {
      const encoder = new TextEncoder();
      const normalized = content.trim().replace(/\r?\n/g, "\r\n") + "\r\n";
      const payload = Array.from(encoder.encode(normalized));
      await invoke("write_pty", { id: termData.ptyId, data: payload });
      setExecStatus("success");
      setEdgeStatus("success");
    } catch (e) {
      setExecStatus("error");
      setExecError(String(e));
      setEdgeStatus("error");
    }
    setTimeout(() => {
      setExecStatus("idle");
      setEdgeStatus("idle");
    }, 2000);
  }, [id, edges, getNode, content, setEdgeStatus]);

  const borderColor = commandMode ? "#7c3aed" : BORDER_COLOR;

  const modeBadge = (
    <button
      onClick={toggleCommandMode}
      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border transition-colors nodrag ${
        commandMode
          ? "bg-violet-500/30 text-violet-300 border-violet-500/50"
          : "bg-amber-500/20 text-amber-400 border-amber-500/30"
      }`}
      title={commandMode ? "Command mode (send directly)" : "Text mode (context note)"}
    >
      {commandMode ? "CMD" : "TXT"}
    </button>
  );

  const priorityBadge = (
    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-amber-500/20 text-amber-400 border-amber-500/30">
      P{priority}
    </span>
  );

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={borderColor}
      minWidth={300}
      minHeight={200}
      label={label}
      badges={<>{modeBadge}{priorityBadge}</>}
      statusLeft={`${content.length} chars`}
      statusRight={
        <span style={{ color: commandMode ? "#a78bfa" : "#fbbf24", opacity: 0.6 }}>
          {commandMode ? "command" : "note"}
        </span>
      }
      handles={[{ type: "source", position: Position.Right, color: commandMode ? "#7c3aed" : "#f59e0b" }]}
    >
      {/* Content area */}
      <textarea
        className="flex-1 min-h-0 w-full bg-transparent text-sm p-3 resize-none outline-none nodrag nowheel"
        style={{ color: "var(--mx-text)" }}
        value={content}
        onChange={handleChange}
        placeholder={
          commandMode
            ? "Type a command to execute in the terminal..."
            : "System instruction for connected terminals..."
        }
        spellCheck={false}
      />

      {/* Execute button (command mode only) */}
      {commandMode && (
        <div className="px-3 py-2" style={{ borderTop: "1px solid var(--mx-border)" }}>
          <button
            onClick={handleExecute}
            disabled={execStatus === "sending" || !content.trim()}
            className={`w-full py-1.5 rounded text-sm font-semibold transition-all nodrag ${
              execStatus === "sending"
                ? "bg-violet-500/20 text-violet-300 cursor-wait"
                : execStatus === "error"
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : execStatus === "success"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-violet-500/30 text-violet-300 hover:bg-violet-500/40 active:bg-violet-500/50"
            }`}
          >
            {getStatusLabel(execStatus)}
          </button>
          {execError && execStatus === "error" && (
            <div
              className="mt-1.5 px-2 py-1 rounded text-[10px] text-red-400 truncate"
              style={{ background: "var(--mx-input-bg)" }}
            >
              {execError}
            </div>
          )}
        </div>
      )}
    </NodeWrapper>
  );
}

function getStatusLabel(status: ExecStatus): string {
  switch (status) {
    case "sending":
      return "Sending...";
    case "success":
      return "Sent";
    case "error":
      return "Error - Retry";
    default:
      return "EXECUTE";
  }
}

export default memo(NoteNode);

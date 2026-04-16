import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import { useShallow } from "zustand/react/shallow";
import NodeWrapper from "./NodeWrapper";
import type { MarkdownNodeData } from "../../types";

const BORDER_COLOR = "#64748b";
const HANDLES = [
  { id: "top", type: "target" as const, position: Position.Top, color: "#64748b" },
  { id: "bottom", type: "source" as const, position: Position.Bottom, color: "#64748b" },
  { id: "left", type: "target" as const, position: Position.Left, color: "#64748b" },
  { id: "right", type: "source" as const, position: Position.Right, color: "#64748b" },
];

function MarkdownNodeInner({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as MarkdownNodeData;
  const label = nodeData.label ?? "Markdown";

  const hibernatedGroups = useCanvasStore(useShallow((s) => s.hibernatedGroups));
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [content, setContent] = useState(nodeData.content ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  // Sync external content changes
  useEffect(() => {
    if (nodeData.content !== undefined && nodeData.content !== content) {
      setContent(nodeData.content);
    }
  }, [nodeData.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced persist
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleContentChange = useCallback(
    (value: string) => {
      setContent(value);
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, content: value } } : n,
          ),
        );
        syncDebounced();
      }, 300);
    },
    [id, setNodes, syncDebounced],
  );

  // Focus textarea when switching to edit
  useEffect(() => {
    if (mode === "edit" && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [mode]);

  const toggleButton = (
    <button
      className="px-1.5 py-0.5 text-[9px] font-semibold rounded transition-colors"
      style={{
        background: mode === "edit" ? "rgba(100,116,139,0.2)" : "transparent",
        color: mode === "edit" ? "#94a3b8" : "var(--mx-text-muted)",
        border: "1px solid rgba(100,116,139,0.2)",
      }}
      onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(100,116,139,0.3)")}
      onMouseLeave={(e) =>
        (e.currentTarget.style.background =
          mode === "edit" ? "rgba(100,116,139,0.2)" : "transparent")
      }
    >
      {mode === "edit" ? "Preview" : "Edit"}
    </button>
  );

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={400}
        minHeight={300}
        label={label}
        badges={
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-slate-500/20 text-slate-400 border-slate-500/30">
            sleep
          </span>
        }
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm" style={{ color: "var(--mx-text-muted)" }}>Hibernated</span>
        </div>
      </NodeWrapper>
    );
  }

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={BORDER_COLOR}
      minWidth={400}
      minHeight={300}
      label={label}
      titleBarExtra={toggleButton}
      badges={
        <span
          className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
            mode === "edit"
              ? "bg-slate-500/20 text-slate-400 border-slate-500/30"
              : "bg-slate-500/10 text-slate-500 border-slate-500/20"
          }`}
        >
          {mode}
        </span>
      }
      statusLeft={`${content.length} chars`}
      statusRight={<span style={{ color: "rgba(100,116,139,0.6)" }}>markdown</span>}
      handles={HANDLES}
    >
      <div className="flex-1 min-h-0 nodrag nowheel">
        {mode === "edit" ? (
          <textarea
            ref={textareaRef}
            className="w-full h-full resize-none p-3 text-xs leading-relaxed font-mono"
            style={{
              background: "transparent",
              color: "var(--mx-text)",
              border: "none",
              outline: "none",
            }}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Write markdown here..."
            spellCheck={false}
          />
        ) : (
          <div
            className="w-full h-full overflow-y-auto overflow-x-hidden p-3"
          >
            {content ? (
              <div className="markdown-prose prose prose-sm prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-[11px]" style={{ color: "var(--mx-text-muted)" }}>
                  Empty — click Edit to write
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

const MarkdownNode = memo(MarkdownNodeInner);
export default MarkdownNode;

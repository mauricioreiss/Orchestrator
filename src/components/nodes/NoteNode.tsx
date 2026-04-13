import { memo, useState, useCallback, useRef, useEffect } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import type { NoteNodeData } from "../../types";
import { useCanvasSync } from "../../hooks/useCanvasSync";

const BORDER_COLOR = "#f59e0b";
const CONTENT_DEBOUNCE_MS = 300;

function NoteNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NoteNodeData;
  const label = nodeData.label ?? "Note";
  const priority = nodeData.priority ?? 1;

  const [content, setContent] = useState(nodeData.content ?? "");
  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
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

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={300}
        minHeight={200}
        lineStyle={{ borderColor: BORDER_COLOR }}
        handleStyle={{
          width: 10,
          height: 10,
          backgroundColor: BORDER_COLOR,
          borderColor: BORDER_COLOR,
        }}
      />

      <div
        className="flex flex-col h-full rounded-lg overflow-hidden shadow-2xl"
        style={{
          border: `1px solid ${selected ? BORDER_COLOR : "#313244"}`,
          background: "#181825",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b] border-b border-[#313244] select-none cursor-grab active:cursor-grabbing">
          <span className="text-sm font-medium text-[#cdd6f4] truncate max-w-[200px]">
            {label}
          </span>
          <div className="flex items-center gap-2">
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
          placeholder="System instruction for connected terminals..."
          spellCheck={false}
        />

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-[#11111b] border-t border-[#313244] select-none">
          <span className="text-[10px] text-[#6c7086]">
            {content.length} chars
          </span>
          <span className="text-[10px] text-amber-400/60">note</span>
        </div>
      </div>

      {/* Source handle: connects TO terminals */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-[#181825]"
      />
    </>
  );
}

export default memo(NoteNode);

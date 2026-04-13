import { memo, useState, useCallback, useRef, useEffect } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import type { VSCodeNodeData } from "../../types";
import { useCanvasSync } from "../../hooks/useCanvasSync";

const BORDER_COLOR = "#06b6d4";
const PATH_DEBOUNCE_MS = 500;

function VSCodeNode({ id, data, selected }: NodeProps) {
  const nodeData = data as VSCodeNodeData;
  const label = nodeData.label ?? "VS Code";

  const [path, setPath] = useState(nodeData.workspacePath ?? "");
  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Propagate path changes to React Flow node data (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, workspacePath: path } }
            : n,
        ),
      );
      syncDebounced();
    }, PATH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [path, id, setNodes, syncDebounced]);

  const handlePathChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPath(e.target.value);
    },
    [],
  );

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={320}
        minHeight={120}
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
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
            cwd
          </span>
        </div>

        {/* Workspace path input */}
        <div className="flex-1 flex flex-col gap-2 p-3">
          <label className="text-[10px] text-[#6c7086] uppercase tracking-wider">
            Workspace Path
          </label>
          <input
            type="text"
            className="w-full bg-[#11111b] text-[#cdd6f4] text-sm px-3 py-2 rounded border border-[#313244] outline-none focus:border-cyan-500/50 placeholder-[#6c7086] nodrag"
            value={path}
            onChange={handlePathChange}
            placeholder="C:\Users\mauri\project"
            spellCheck={false}
          />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-[#11111b] border-t border-[#313244] select-none">
          <span className="text-[10px] text-[#6c7086] truncate max-w-[250px]">
            {path || "no path set"}
          </span>
          <span className="text-[10px] text-cyan-400/60">vscode</span>
        </div>
      </div>

      {/* Source handle: connects TO terminals */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-[#181825]"
      />
    </>
  );
}

export default memo(VSCodeNode);

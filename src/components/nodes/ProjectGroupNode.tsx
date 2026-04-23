import { memo, useState, useCallback, useEffect, useRef } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import type { GroupNodeData } from "../../types";
import { GROUP_COLORS } from "../../types";
import PersonaArchitectModal from "../PersonaArchitectModal";

function ProjectGroupNode({ id, data, selected }: NodeProps) {
  const nodeData = data as GroupNodeData;
  const color = nodeData.color ?? "#3b82f6";

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(nodeData.label ?? "Project");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showArchitect, setShowArchitect] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  useEffect(() => { setLabel(nodeData.label ?? "Project"); }, [nodeData.label]);

  const commitLabel = useCallback(() => {
    setEditing(false);
    setNodes((nds) =>
      nds.map((n) => n.id === id ? { ...n, data: { ...n.data, label } } : n),
    );
    syncDebounced();
  }, [id, label, setNodes, syncDebounced]);

  const handleColorChange = useCallback(
    (newColor: string) => {
      setNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, color: newColor } } : n),
      );
      setPickerOpen(false);
      syncDebounced();
    },
    [id, setNodes, syncDebounced],
  );

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={600}
        minHeight={400}
        lineStyle={{ borderColor: color }}
        handleStyle={{ width: 10, height: 10, backgroundColor: color, borderColor: color }}
      />

      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 12,
          border: `2px ${selected ? "solid" : "dashed"} ${selected ? color : color + "40"}`,
          background: color + "0D",
          transition: "border-color 0.3s",
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-3 py-1.5 select-none cursor-grab active:cursor-grabbing"
          style={{ background: color + "1A", borderRadius: "10px 10px 0 0" }}
        >
          {editing ? (
            <input
              ref={inputRef}
              className="bg-transparent text-sm font-semibold outline-none border-b nodrag"
              style={{ color, borderColor: "var(--mx-border-strong)" }}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLabel();
                if (e.key === "Escape") { setLabel(nodeData.label ?? "Project"); setEditing(false); }
              }}
            />
          ) : (
            <span className="text-sm font-semibold cursor-text" style={{ color }} onDoubleClick={() => setEditing(true)}>
              {label}
            </span>
          )}

          <button
              onClick={() => setShowArchitect(true)}
              className="flex items-center justify-center w-5 h-5 rounded hover:opacity-80 transition-opacity nodrag"
              style={{ color }}
              title="Persona Architect"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </button>

          {/* Color picker */}
          <div className="relative nodrag">
            <button
              onClick={() => setPickerOpen(!pickerOpen)}
              className="flex items-center justify-center w-5 h-5 rounded-full hover:opacity-80 transition-opacity"
              style={{ backgroundColor: color }}
            />
            {pickerOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-50 flex gap-1.5 p-2 rounded-lg"
                style={{ background: "var(--mx-surface)", border: "1px solid var(--mx-border-strong)" }}
              >
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleColorChange(c)}
                    className="w-4 h-4 rounded-full hover:scale-125 transition-transform"
                    style={{
                      backgroundColor: c,
                      border: c === color ? "2px solid white" : "2px solid transparent",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <PersonaArchitectModal
        open={showArchitect}
        onClose={() => setShowArchitect(false)}
        projectName={label}
      />
    </>
  );
}

export default memo(ProjectGroupNode);

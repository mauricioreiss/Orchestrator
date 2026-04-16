import { memo, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { Handle, Position, NodeResizer, useReactFlow } from "@xyflow/react";
import { AnimatePresence } from "framer-motion";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import NodeFullscreen from "./NodeFullscreen";

interface HandleConfig {
  /** Unique id within the node. Required when a node has multiple handles
   * of the same type so React Flow can resolve clicks unambiguously. */
  id: string;
  type: "source" | "target";
  position: Position;
  color?: string;
}

interface NodeWrapperProps {
  id: string;
  selected?: boolean;
  borderColor: string;
  minWidth?: number;
  minHeight?: number;
  // Title bar
  label: string;
  badges?: ReactNode;
  titleBarExtra?: ReactNode;
  // Content
  children: ReactNode;
  // Fullscreen content (if different from children, e.g. terminal needs separate ref)
  fullscreenContent?: ReactNode;
  // Status bar (omit to hide)
  statusLeft?: ReactNode;
  statusRight?: ReactNode;
  // Handles
  handles?: HandleConfig[];
  // Glassmorphism override
  noBlur?: boolean;
  // Style overrides for border flash etc
  borderOverride?: string;
  // Disable window controls (for web-only or hibernated states)
  hideWindowControls?: boolean;
}

function NodeWrapperInner({
  id,
  selected,
  borderColor,
  minWidth = 300,
  minHeight = 200,
  label,
  badges,
  titleBarExtra,
  children,
  fullscreenContent,
  statusLeft,
  statusRight,
  handles,
  noBlur,
  borderOverride,
  hideWindowControls,
}: NodeWrapperProps) {
  const activeBorder = borderOverride ?? borderColor;
  const showStatusBar = statusLeft !== undefined || statusRight !== undefined;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  const { deleteElements, setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  const handleClose = useCallback(() => {
    deleteElements({ nodes: [{ id }] });
  }, [id, deleteElements]);

  const handleMaximize = useCallback(() => {
    setIsFullscreen(true);
  }, []);

  const commitRename = useCallback(() => {
    const trimmed = editLabel.trim();
    if (trimmed && trimmed !== label) {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: trimmed } } : n)),
      );
      syncDebounced();
    } else {
      setEditLabel(label);
    }
    setIsEditing(false);
  }, [editLabel, label, id, setNodes, syncDebounced]);

  const startEditing = useCallback(() => {
    setEditLabel(label);
    setIsEditing(true);
  }, [label]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={minWidth}
        minHeight={minHeight}
        lineStyle={{ borderColor: activeBorder }}
        handleStyle={{
          width: 10,
          height: 10,
          backgroundColor: activeBorder,
          borderColor: activeBorder,
        }}
      />

      <div
        className="flex flex-col h-full rounded-lg"
        style={{
          border: `1px solid ${selected ? activeBorder : "var(--mx-glass-border)"}`,
          background: "var(--mx-glass-bg)",
          backdropFilter: noBlur ? undefined : "blur(12px)",
          WebkitBackdropFilter: noBlur ? undefined : "blur(12px)",
          boxShadow: selected
            ? `0 0 20px ${activeBorder}33, var(--mx-node-shadow-selected)`
            : "var(--mx-node-shadow)",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-3 py-1.5 select-none cursor-grab active:cursor-grabbing"
          style={{
            background: "var(--mx-titlebar)",
            borderBottom: "1px solid var(--mx-border)",
          }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setEditLabel(label);
                  setIsEditing(false);
                }
              }}
              className="text-sm font-medium bg-transparent outline-none border-b max-w-[200px] nodrag"
              style={{ color: "var(--mx-text)", borderColor: activeBorder }}
              spellCheck={false}
            />
          ) : (
            <span
              className="text-sm font-medium truncate max-w-[200px] group/rename flex items-center gap-1"
              style={{ color: "var(--mx-text)" }}
            >
              {label}
              <button
                onClick={(e) => { e.stopPropagation(); startEditing(); }}
                className="opacity-0 group-hover/rename:opacity-60 hover:!opacity-100 transition-opacity nodrag"
                title="Rename"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M7.5 1.5l1 1-5.5 5.5-1.5.5.5-1.5z" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {titleBarExtra}
            {badges}

            {/* Window controls */}
            {!hideWindowControls && (
              <div className="flex items-center gap-0.5 ml-1 nodrag">
                {/* Maximize */}
                <button
                  onClick={handleMaximize}
                  className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                  style={{ color: "var(--mx-text-muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--mx-sidebar-hover)";
                    e.currentTarget.style.color = "var(--mx-text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--mx-text-muted)";
                  }}
                  title="Maximize"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </button>
                {/* Close */}
                <button
                  onClick={handleClose}
                  className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                  style={{ color: "var(--mx-text-muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(239,68,68,0.15)";
                    e.currentTarget.style.color = "#ef4444";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--mx-text-muted)";
                  }}
                  title="Close node"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-b-lg">{children}</div>

        {/* Status bar */}
        {showStatusBar && (
          <div
            className="flex items-center justify-between px-3 py-1 select-none"
            style={{
              background: "var(--mx-titlebar)",
              borderTop: "1px solid var(--mx-border)",
            }}
          >
            <span className="text-[10px]" style={{ color: "var(--mx-text-muted)" }}>
              {statusLeft}
            </span>
            <span className="text-[10px]" style={{ color: "var(--mx-text-muted)" }}>
              {statusRight}
            </span>
          </div>
        )}
      </div>

      {/* Handles — unique id required for reliable hit resolution when a
          node has multiple handles of the same type. */}
      {handles?.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type={h.type}
          position={h.position}
          className="!w-4 !h-4 !border-2 mx-handle pointer-events-auto"
          style={{
            backgroundColor: h.color ?? borderColor,
            borderColor: "var(--mx-bg)",
            zIndex: 50,
          }}
        />
      ))}

      {/* Fullscreen portal */}
      <AnimatePresence>
        {isFullscreen && (
          <NodeFullscreen
            title={label}
            borderColor={borderColor}
            onClose={() => setIsFullscreen(false)}
          >
            {fullscreenContent ?? children}
          </NodeFullscreen>
        )}
      </AnimatePresence>
    </>
  );
}

const NodeWrapper = memo(NodeWrapperInner);
export default NodeWrapper;
export type { HandleConfig, NodeWrapperProps };

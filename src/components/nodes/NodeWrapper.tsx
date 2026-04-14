import { memo, useState, useCallback, type ReactNode } from "react";
import { Handle, Position, NodeResizer, useReactFlow } from "@xyflow/react";
import { AnimatePresence } from "framer-motion";
import NodeFullscreen from "./NodeFullscreen";

interface HandleConfig {
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
  const { deleteElements } = useReactFlow();

  const handleClose = useCallback(() => {
    deleteElements({ nodes: [{ id }] });
  }, [id, deleteElements]);

  const handleMaximize = useCallback(() => {
    setIsFullscreen(true);
  }, []);

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
        className="flex flex-col h-full rounded-lg overflow-hidden"
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
          <span
            className="text-sm font-medium truncate max-w-[200px]"
            style={{ color: "var(--mx-text)" }}
          >
            {label}
          </span>
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
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>

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

      {/* Handles */}
      {handles?.map((h, i) => (
        <Handle
          key={`${h.type}-${h.position}-${i}`}
          type={h.type}
          position={h.position}
          className="!w-3 !h-3 !border-2"
          style={{
            backgroundColor: h.color ?? borderColor,
            borderColor: "var(--mx-bg)",
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

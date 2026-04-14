import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

interface NodeFullscreenProps {
  title: string;
  borderColor: string;
  onClose: () => void;
  children: ReactNode;
}

export default function NodeFullscreen({ title, borderColor, onClose, children }: NodeFullscreenProps) {
  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[9998] flex flex-col"
      style={{ background: "var(--mx-bg)" }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{
          background: "var(--mx-titlebar)",
          borderBottom: "1px solid var(--mx-border)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: borderColor }} />
          <span className="text-sm font-medium" style={{ color: "var(--mx-text)" }}>
            {title}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--mx-text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(239,68,68,0.15)";
            e.currentTarget.style.color = "#ef4444";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--mx-text-muted)";
          }}
          title="Exit fullscreen (Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </motion.div>,
    document.body,
  );
}

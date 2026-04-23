import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../store/canvasStore";
import type { GroupNodeData } from "../types";

export default function ProjectNavigator() {
  const [open, setOpen] = useState(false);
  const { fitView } = useReactFlow();

  const groups = useCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type === "group")),
  );

  if (groups.length === 0) return null;

  const handleNavigate = (groupId: string) => {
    fitView({ nodes: [{ id: groupId }], duration: 800, padding: 0.2 });
  };

  return (
    <div
      style={{
        background: "var(--mx-glass-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid var(--mx-glass-border)",
        borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        minWidth: open ? 180 : "auto",
        overflow: "hidden",
        transition: "min-width 0.2s ease",
      }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 transition-colors"
        style={{ color: "var(--mx-text-secondary)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-sidebar-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {/* Compass icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" opacity="0.6" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
        <span className="text-[11px] font-semibold whitespace-nowrap">
          {open ? "Meus Projetos" : groups.length.toString()}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className="shrink-0 ml-auto transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Group list */}
      {open && (
        <div className="flex flex-col pb-1">
          {groups.map((g) => {
            const gData = g.data as GroupNodeData;
            const gLabel = gData.label ?? "Project";
            const gColor = gData.color ?? "#3b82f6";
            return (
              <button
                key={g.id}
                onClick={() => handleNavigate(g.id)}
                className="flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors"
                style={{ color: "var(--mx-text-secondary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-sidebar-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: gColor }}
                />
                <span className="text-[11px] font-medium truncate">{gLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

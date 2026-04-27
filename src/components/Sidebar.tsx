import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, Globe, Database, Settings } from "lucide-react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { useTheme } from "../contexts/ThemeContext";
import { useCanvasStore } from "../store/canvasStore";
import type { GroupNodeData } from "../types";

interface SidebarProps {
  onOpenSettings: () => void;
}

const NODE_BUTTONS = [
  {
    key: "terminal",
    label: "Terminal",
    color: "#A855F7",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 8l3 2.5L6 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 13h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "note",
    label: "Note",
    color: "#f59e0b",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 7h6M7 10h6M7 13h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "vscode",
    label: "VS Code",
    color: "#06b6d4",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 5l5 5-5 5M10 15h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: "obsidian",
    label: "Vault",
    color: "#a855f7",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M5 2l10 3v10l-10 3V2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 7l5 3-5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: "kanban",
    label: "Tasks",
    color: "#10b981",
    icon: <LayoutDashboard size={20} />,
  },
  {
    key: "api",
    label: "API",
    color: "#f97316",
    icon: <Globe size={20} />,
  },
  {
    key: "db",
    label: "Database",
    color: "#0ea5e9",
    icon: <Database size={20} />,
  },
  {
    key: "markdown",
    label: "Markdown",
    color: "#64748b",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 7h6M7 10h4M7 13h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "architect",
    label: "Architect",
    color: "#8b5cf6",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2l7 4v8l-7 4-7-4V6l7-4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M10 10V2M10 10l7-4M10 10l-7-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "git",
    label: "Git",
    color: "#f43f5e",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="14" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="10" cy="16" r="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 8v2a4 4 0 004 4M14 8v2a4 4 0 01-4 4" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    key: "logviewer",
    label: "Log Viewer",
    color: "#22c55e",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 7h6M7 10h4M7 13h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="14" cy="14" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: "group",
    label: "Group",
    color: "#64748b",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2.5" y="2.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 3" />
      </svg>
    ),
  },
] as const;

type NodeKey = typeof NODE_BUTTONS[number]["key"];

const ADD_ACTIONS: Record<NodeKey, (store: ReturnType<typeof useCanvasStore.getState>) => void> = {
  terminal: (s) => s.addTerminalNode(),
  note: (s) => s.addNoteNode(),
  vscode: (s) => s.addVSCodeNode(),
  obsidian: (s) => s.addObsidianNode(),
  kanban: (s) => s.addKanbanNode(),
  api: (s) => s.addApiNode(),
  db: (s) => s.addDbNode(),
  markdown: (s) => s.addMarkdownNode(),
  architect: (s) => s.addArchitectNode(),
  git: (s) => s.addGitNode(),
  logviewer: (s) => s.addLogViewerNode(),
  group: (s) => s.addGroupNode(),
};

export default function Sidebar({ onOpenSettings }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const nodeCount = useCanvasStore((s) => s.nodes.length);
  const saveStatus = useCanvasStore((s) => s.saveStatus);

  // useShallow + .filter() only — returns SAME node references from the store,
  // so shallow comparison works. NEVER chain .map() here (creates new refs → infinite loop).
  const groups: Node[] = useCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type === "group")),
  );

  // Ref-guard useReactFlow: avoids subscribing to RF internal store updates
  const reactFlowRef = useRef<ReturnType<typeof useReactFlow>>(null!);
  reactFlowRef.current = useReactFlow();

  const handleAdd = useCallback((key: NodeKey) => {
    const store = useCanvasStore.getState();
    ADD_ACTIONS[key](store);
  }, []);

  return (
    <motion.aside
      className="flex flex-col h-full z-50 select-none shrink-0 no-drag-region"
      style={{
        background: "var(--mx-sidebar-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRight: "1px solid var(--mx-border)",
      }}
      animate={{ width: expanded ? 180 : 56 }}
      transition={{ duration: 0.15, ease: "easeInOut" }}
    >
      {/* Toggle / Brand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-4 h-12 shrink-0 hover:opacity-80 transition-opacity"
        style={{ color: "var(--mx-accent)" }}
        title={expanded ? "Collapse" : "Expand"}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      <div className="w-8 mx-auto" style={{ height: 1, background: "var(--mx-border)" }} />

      {/* Node buttons */}
      <div className="flex flex-col gap-0.5 py-2 px-2 flex-1">
        {NODE_BUTTONS.map((btn) => (
          <button
            key={btn.key}
            onClick={() => handleAdd(btn.key)}
            className="flex items-center gap-3 px-2 h-9 rounded-lg transition-colors relative group"
            style={{ color: btn.color }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-sidebar-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            title={expanded ? undefined : btn.label}
          >
            <div className="shrink-0 w-5 h-5 flex items-center justify-center">{btn.icon}</div>
            <AnimatePresence>
              {expanded && (
                <motion.span
                  className="text-xs font-medium whitespace-nowrap overflow-hidden"
                  style={{ color: "var(--mx-text-secondary)" }}
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.1 }}
                >
                  {btn.label}
                </motion.span>
              )}
            </AnimatePresence>

            {/* Tooltip when collapsed */}
            {!expanded && (
              <div
                className="absolute left-full ml-2 px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
                style={{
                  background: "var(--mx-surface)",
                  border: "1px solid var(--mx-border-strong)",
                  color: "var(--mx-text)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                }}
              >
                {btn.label}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Projects (Spatial Navigation) */}
      {groups.length > 0 && (
        <div className="flex flex-col gap-0.5 px-2 pb-1">
          <div className="w-8 mx-auto mb-1" style={{ height: 1, background: "var(--mx-border)" }} />
          <AnimatePresence>
            {expanded && (
              <motion.span
                className="text-[9px] font-semibold uppercase tracking-wider px-2 pb-0.5"
                style={{ color: "var(--mx-text-muted)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                Projects
              </motion.span>
            )}
          </AnimatePresence>
          {groups.map((g) => {
              const gData = g.data as GroupNodeData;
              const gLabel = gData.label ?? "Project";
              const gColor = gData.color ?? "#3b82f6";
              return (
                <button
                  key={g.id}
                  onClick={() => reactFlowRef.current.fitView({ nodes: [{ id: g.id }], duration: 800, padding: 0.2 })}
                  className="flex items-center gap-3 px-2 h-8 rounded-lg transition-colors relative group"
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-sidebar-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  title={expanded ? undefined : gLabel}
                >
                  <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: gColor }}
                    />
                  </div>
                  <AnimatePresence>
                    {expanded && (
                      <motion.span
                        className="text-[11px] font-medium whitespace-nowrap overflow-hidden truncate"
                        style={{ color: "var(--mx-text-secondary)" }}
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.1 }}
                      >
                        {gLabel}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {!expanded && (
                    <div
                      className="absolute left-full ml-2 px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
                      style={{
                        background: "var(--mx-surface)",
                        border: "1px solid var(--mx-border-strong)",
                        color: "var(--mx-text)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                      }}
                    >
                      {gLabel}
                    </div>
                  )}
                </button>
              );
          })}
        </div>
      )}

      {/* Bottom section */}
      <div className="flex flex-col gap-0.5 px-2 pb-2">
        <div className="w-8 mx-auto mb-1" style={{ height: 1, background: "var(--mx-border)" }} />

        {/* Node count */}
        <div className="flex items-center gap-3 px-2 h-8">
          <div className="shrink-0 w-5 h-5 flex items-center justify-center">
            <div className={`w-2 h-2 rounded-full ${saveStatus === "saving" ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
          </div>
          <AnimatePresence>
            {expanded && (
              <motion.span
                className="text-xs font-mono tabular-nums"
                style={{ color: "var(--mx-text-muted)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {nodeCount} nodes
                {saveStatus === "saving" && <span className="text-amber-400"> · saving</span>}
                {saveStatus === "saved" && <span className="text-emerald-400"> · saved</span>}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-3 px-2 h-9 rounded-lg transition-colors"
          style={{ color: "var(--mx-text-secondary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-sidebar-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          title="Settings"
        >
          <Settings size={20} className="shrink-0" />
          <AnimatePresence>
            {expanded && (
              <motion.span className="text-xs font-medium" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-2 h-9 rounded-lg transition-colors"
          style={{ color: "var(--mx-text-secondary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-sidebar-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          {theme === "dark" ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0">
              <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0">
              <path d="M17 11.5A7.5 7.5 0 018.5 3a7.5 7.5 0 108.5 8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <AnimatePresence>
            {expanded && (
              <motion.span className="text-xs font-medium" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}

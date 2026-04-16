import { useEffect, useRef, useState, useCallback } from "react";
import { Command } from "cmdk";
import { useReactFlow, type Node } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { LayoutDashboard, Globe, Database } from "lucide-react";
import { useCanvasStore } from "../store/canvasStore";
import { useTheme } from "../contexts/ThemeContext";
import type { GroupNodeData } from "../types";

interface CommandPaletteProps {
  onOpenSettings: () => void;
}

export default function CommandPalette({ onOpenSettings }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  // Store a ref to useReactFlow so we don't depend on it for re-renders.
  // The functions (fitView, screenToFlowPosition) are stable but the hook
  // itself subscribes to the RF internal store.
  const reactFlowRef = useRef<ReturnType<typeof useReactFlow>>(null!);
  reactFlowRef.current = useReactFlow();

  const { toggleTheme, theme } = useTheme();

  // useShallow + .filter() only — returns SAME node references from the store.
  // NEVER chain .map() here (creates new object refs → defeats shallow comparison).
  const groups: Node[] = useCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type === "group")),
  );

  // Ctrl+K / Cmd+K toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const getCenter = useCallback(() => {
    return reactFlowRef.current.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  }, []);

  const run = useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, []);

  const navigateTo = useCallback((groupId: string) => {
    reactFlowRef.current.fitView({
      nodes: [{ id: groupId }],
      duration: 800,
      padding: 0.2,
    });
    setOpen(false);
  }, []);

  if (!open) return null;

  const store = useCanvasStore.getState();

  return (
    <>
      {/* Overlay */}
      <div cmdk-overlay="" onClick={() => setOpen(false)} />

      {/* Dialog */}
      <div cmdk-dialog="">
        <Command>
          <Command.Input placeholder="Type a command..." autoFocus />
          <Command.List>
            <Command.Empty>No results found.</Command.Empty>

            {/* Create group */}
            <Command.Group heading="Create">
              <Command.Item onSelect={() => run(() => store.addTerminalNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#A855F7" }}>
                  <rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M6 8l3 2.5L6 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M11 13h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span>Create Terminal</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addNoteNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#f59e0b" }}>
                  <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 7h6M7 10h6M7 13h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>Create Note</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addWorkspaceNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#14b8a6" }}>
                  <rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 3v14" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M10 8l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Create Workspace</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addMarkdownNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#64748b" }}>
                  <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 7h6M7 10h4M7 13h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>Create Markdown</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addKanbanNode(getCenter()))}>
                <LayoutDashboard size={16} style={{ color: "#10b981" }} />
                <span>Create Kanban</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addApiNode(getCenter()))}>
                <Globe size={16} style={{ color: "#f97316" }} />
                <span>Create API</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addDbNode(getCenter()))}>
                <Database size={16} style={{ color: "#0ea5e9" }} />
                <span>Create Database</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addBrowserNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#f43f5e" }}>
                  <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M2.5 10h15" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <span>Create Browser</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addGroupNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#64748b" }}>
                  <rect x="2.5" y="2.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 3" />
                </svg>
                <span>Create Group</span>
              </Command.Item>
            </Command.Group>

            {/* Navigate group */}
            {groups.length > 0 && (
              <Command.Group heading="Navigate">
                {groups.map((g) => {
                  const gData = g.data as GroupNodeData;
                  return (
                    <Command.Item
                      key={g.id}
                      onSelect={() => navigateTo(g.id)}
                    >
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: gData.color ?? "#3b82f6" }}
                      />
                      <span>{gData.label ?? "Project"}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Settings group */}
            <Command.Group heading="Settings">
              <Command.Item onSelect={() => run(toggleTheme)}>
                {theme === "dark" ? (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "var(--mx-text-secondary)" }}>
                    <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M10 2v2M10 16v2M2 10h2M16 10h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "var(--mx-text-secondary)" }}>
                    <path d="M17 11.5A7.5 7.5 0 018.5 3a7.5 7.5 0 108.5 8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <span>{theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
              </Command.Item>

              <Command.Item onSelect={() => run(onOpenSettings)}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "var(--mx-text-secondary)" }}>
                  <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>Open Settings</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </>
  );
}

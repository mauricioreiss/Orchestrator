import { useEffect, useRef, useState, useCallback } from "react";
import { Command } from "cmdk";
import { useReactFlow, type Node } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { LayoutDashboard, Globe, Database } from "lucide-react";
import { toast } from "sonner";
import { invoke, isElectron } from "../lib/electron";
import { useCanvasStore } from "../store/canvasStore";
import { useTheme } from "../contexts/ThemeContext";
import type { GroupNodeData } from "../types";

// Node type → color for the focus dot
const NODE_COLORS: Record<string, string> = {
  terminal: "#A855F7",
  note: "#f59e0b",
  vscode: "#06b6d4",
  obsidian: "#a855f7",
  kanban: "#10b981",
  api: "#f97316",
  db: "#0ea5e9",
  monaco: "#6366f1",
  markdown: "#64748b",
  architect: "#8b5cf6",
  git: "#f43f5e",
  logviewer: "#22c55e",
  group: "#3b82f6",
};

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

  // All nodes for search/focus
  const allNodes: Node[] = useCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type !== "group")),
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

  const navigateTo = useCallback((nodeId: string) => {
    reactFlowRef.current.fitView({
      nodes: [{ id: nodeId }],
      duration: 800,
      padding: 0.2,
    });
    setOpen(false);
  }, []);

  const focusNode = useCallback((node: Node) => {
    const w = (node.style?.width as number) ?? 300;
    const h = (node.style?.height as number) ?? 200;
    reactFlowRef.current.setCenter(
      node.position.x + w / 2,
      node.position.y + h / 2,
      { zoom: 1.2, duration: 800 },
    );
    setOpen(false);
  }, []);

  const handleKillAll = useCallback(async () => {
    if (!isElectron()) return;
    try {
      await invoke("kill_all_processes");
      toast.success("Todos os processos encerrados.");
    } catch (e) {
      toast.error(`Falha ao encerrar processos: ${e}`);
    }
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
          <Command.Input placeholder="Search nodes, create, or type /command..." autoFocus />
          <Command.List>
            <Command.Empty>No results found.</Command.Empty>

            {/* Quick commands */}
            <Command.Group heading="Commands">
              <Command.Item value="/kill-all kill all processes stop" onSelect={handleKillAll}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#ef4444" }}>
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span>/kill-all</span>
                <span className="text-[10px] ml-auto" style={{ color: "var(--mx-text-muted)" }}>Encerrar todos os processos</span>
              </Command.Item>

              <Command.Item value="/add-terminal new terminal" onSelect={() => run(() => store.addTerminalNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#A855F7" }}>
                  <rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M10 7v6M7 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span>/add-terminal</span>
                <span className="text-[10px] ml-auto" style={{ color: "var(--mx-text-muted)" }}>Novo terminal</span>
              </Command.Item>

              <Command.Item value="/add-git new git" onSelect={() => run(() => store.addGitNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#f43f5e" }}>
                  <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="14" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="10" cy="16" r="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M6 8v2a4 4 0 004 4M14 8v2a4 4 0 01-4 4" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                <span>/add-git</span>
                <span className="text-[10px] ml-auto" style={{ color: "var(--mx-text-muted)" }}>Novo Git node</span>
              </Command.Item>

              <Command.Item value="/add-log new log viewer" onSelect={() => run(() => store.addLogViewerNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#22c55e" }}>
                  <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 7h6M7 10h4M7 13h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>/add-log</span>
                <span className="text-[10px] ml-auto" style={{ color: "var(--mx-text-muted)" }}>Novo Log Viewer</span>
              </Command.Item>
            </Command.Group>

            {/* Focus on node by name */}
            {allNodes.length > 0 && (
              <Command.Group heading="Focus Node">
                {allNodes.map((n) => {
                  const nodeLabel = (n.data as Record<string, unknown>).label as string ?? n.type ?? "Node";
                  const color = NODE_COLORS[n.type ?? ""] ?? "#A855F7";
                  return (
                    <Command.Item
                      key={n.id}
                      value={`${nodeLabel} ${n.type}`}
                      onSelect={() => focusNode(n)}
                    >
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span>{nodeLabel}</span>
                      <span className="text-[10px] ml-auto" style={{ color: "var(--mx-text-muted)" }}>{n.type}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

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

              <Command.Item onSelect={() => run(() => store.addMarkdownNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#64748b" }}>
                  <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 7h6M7 10h4M7 13h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>Create Markdown</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addKanbanNode(getCenter()))}>
                <LayoutDashboard size={16} style={{ color: "#10b981" }} />
                <span>Create Tasks</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addApiNode(getCenter()))}>
                <Globe size={16} style={{ color: "#f97316" }} />
                <span>Create API</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addDbNode(getCenter()))}>
                <Database size={16} style={{ color: "#0ea5e9" }} />
                <span>Create Database</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addArchitectNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#8b5cf6" }}>
                  <path d="M10 2l7 4v8l-7 4-7-4V6l7-4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M10 10V2M10 10l7-4M10 10l-7-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>Create Architect</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addGitNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#f43f5e" }}>
                  <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="14" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="10" cy="16" r="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M6 8v2a4 4 0 004 4M14 8v2a4 4 0 01-4 4" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                <span>Create Git</span>
              </Command.Item>

              <Command.Item onSelect={() => run(() => store.addLogViewerNode(getCenter()))}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: "#22c55e" }}>
                  <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 7h6M7 10h4M7 13h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="14" cy="14" r="1" fill="currentColor" />
                </svg>
                <span>Create Log Viewer</span>
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
              <Command.Group heading="Navigate Groups">
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

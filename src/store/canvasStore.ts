import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Viewport,
} from "@xyflow/react";
import { invoke } from "../lib/electron";
import { isElectron } from "../lib/electron";

// Canvas ID for persistence (single canvas MVP)
const CANVAS_ID = "default";
const CANVAS_NAME = "Main Canvas";
const SAVE_DEBOUNCE_MS = 2000;

type SaveStatus = "idle" | "saving" | "saved";

interface CanvasStore {
  // State
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
  loaded: boolean;
  hibernatedGroups: string[];
  saveStatus: SaveStatus;

  // Node/Edge mutations (React Flow compatible)
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection, stroke?: string) => void;
  setNodes: (updater: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (updater: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  setViewport: (viewport: Viewport) => void;
  setHibernatedGroups: (updater: string[] | ((prev: string[]) => string[])) => void;

  // Add node helpers
  addNode: (node: Node) => void;
  addTerminalNode: (position?: { x: number; y: number }) => void;
  addNoteNode: (position?: { x: number; y: number }) => void;
  addVSCodeNode: (position?: { x: number; y: number }) => void;
  addObsidianNode: (position?: { x: number; y: number }) => void;
  addBrowserNode: (position?: { x: number; y: number }) => void;
  addKanbanNode: (position?: { x: number; y: number }) => void;
  addApiNode: (position?: { x: number; y: number }) => void;
  addDbNode: (position?: { x: number; y: number }) => void;
  addGroupNode: (position?: { x: number; y: number }) => void;
  addMarkdownNode: (position?: { x: number; y: number }) => void;
  addArchitectNode: (position?: { x: number; y: number }) => void;
  addMonacoNode: (filePath: string, rootDir: string) => void;

  // Persistence
  save: () => Promise<void>;
  load: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savedResetTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  if (savedResetTimer) clearTimeout(savedResetTimer);
  useCanvasStore.setState({ saveStatus: "saving" });
  saveTimer = setTimeout(() => {
    useCanvasStore.getState().save();
  }, SAVE_DEBOUNCE_MS);
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  loaded: false,
  hibernatedGroups: [],
  saveStatus: "idle" as SaveStatus,

  onNodesChange: (changes) => {
    // Detect node removals and cleanup processes before applying
    const removes = changes.filter((c) => c.type === "remove");
    if (removes.length > 0 && isElectron()) {
      const currentNodes = get().nodes;
      const payload = removes
        .map((r) => {
          const node = currentNodes.find((n) => n.id === r.id);
          if (!node) return null;
          return {
            node_id: node.id,
            node_type: node.type ?? "unknown",
            process_id:
              (node.data as Record<string, unknown>)?.ptyId ?? null,
          };
        })
        .filter(Boolean);
      if (payload.length > 0) {
        invoke("cleanup_nodes", { removed: payload }).catch((e) =>
          console.error("cleanup_nodes failed:", e),
        );
      }
    }

    set({ nodes: applyNodeChanges(changes, get().nodes) });
    scheduleSave();
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    const hasRemoval = changes.some((c) => c.type === "remove");
    if (hasRemoval) scheduleSave();
  },

  onConnect: (connection, stroke = "#A855F7") => {
    set({
      edges: addEdge(
        { ...connection, animated: true, style: { stroke } },
        get().edges,
      ),
    });
    scheduleSave();
  },

  setNodes: (updater) => {
    const nodes = typeof updater === "function" ? updater(get().nodes) : updater;
    set({ nodes });
  },

  setEdges: (updater) => {
    const edges = typeof updater === "function" ? updater(get().edges) : updater;
    set({ edges });
  },

  setViewport: (viewport) => {
    set({ viewport });
  },

  setHibernatedGroups: (updater) => {
    const next = typeof updater === "function" ? updater(get().hibernatedGroups) : updater;
    set({ hibernatedGroups: next });
  },

  addNode: (node) => {
    const current = get().nodes;
    // Groups must appear before children in the array (React Flow parent requirement)
    if (node.type === "group") {
      set({ nodes: [node, ...current] });
    } else {
      set({ nodes: [...current, node] });
    }
    scheduleSave();
  },

  addTerminalNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "terminal").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "terminal",
      position: position ?? { x: 100 + Math.random() * 600, y: 100 + Math.random() * 400 },
      data: { type: "terminal", label: `Terminal ${count}`, role: "Agent" },
      style: { width: 520, height: 360 },
    });
  },

  addNoteNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "note").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "note",
      position: position ?? { x: 50 + Math.random() * 400, y: 50 + Math.random() * 300 },
      data: { type: "note", label: `Note ${count}`, content: "", priority: 1, commandMode: false },
      style: { width: 350, height: 250 },
    });
  },

  addVSCodeNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "vscode").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "vscode",
      position: position ?? { x: 50 + Math.random() * 300, y: 50 + Math.random() * 200 },
      data: { type: "vscode", label: `VS Code ${count}`, workspacePath: "" },
      style: { width: 700, height: 500 },
    });
  },

  addObsidianNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "obsidian").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "obsidian",
      position: position ?? { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 },
      data: { type: "obsidian", label: `Vault ${count}`, vaultPath: "" },
      style: { width: 380, height: 400 },
    });
  },

  addBrowserNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "browser").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "browser",
      position: position ?? { x: 60 + Math.random() * 400, y: 60 + Math.random() * 300 },
      data: { type: "browser", label: `Browser ${count}`, url: "" },
      style: { width: 800, height: 600 },
    });
  },

  addKanbanNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "kanban").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "kanban",
      position: position ?? { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 },
      data: {
        type: "kanban",
        label: `Tasks ${count}`,
        columns: [],
        tasks: [],
      },
      style: { width: 400, height: 400 },
    });
  },

  addApiNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "api").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "api",
      position: position ?? { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 },
      data: {
        type: "api",
        label: `API ${count}`,
        method: "GET",
        url: "",
        body: "",
        headers: [],
      },
      style: { width: 450, height: 500 },
    });
  },

  addDbNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "db").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "db",
      position: position ?? { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 },
      data: {
        type: "db",
        label: `Database ${count}`,
        query: "SELECT * FROM users LIMIT 10;",
      },
      style: { width: 550, height: 400 },
    });
  },

  addGroupNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "group").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "group",
      position: position ?? { x: 50 + Math.random() * 200, y: 50 + Math.random() * 200 },
      data: { type: "group", label: `Project ${count}`, color: "#3b82f6" },
      style: { width: 1200, height: 800, zIndex: -1 },
    });
  },

  addMarkdownNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "markdown").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "markdown",
      position: position ?? { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 },
      data: { type: "markdown", label: `Markdown ${count}`, content: "" },
      style: { width: 500, height: 400 },
    });
  },

  addArchitectNode: (position?) => {
    const count = get().nodes.filter((n) => n.type === "architect").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "architect",
      position: position ?? { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 },
      data: { type: "architect", label: `Architect ${count}` },
      style: { width: 400, height: 500 },
    });
  },

  addMonacoNode: (filePath: string, rootDir: string) => {
    const fileName = filePath.split(/[\\/]/).pop() ?? "untitled";
    const ext = fileName.includes(".") ? (fileName.split(".").pop()?.toLowerCase() ?? "") : "";
    const langMap: Record<string, string> = {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
      py: "python", rs: "rust", go: "go", json: "json", md: "markdown",
      css: "css", html: "html", yaml: "yaml", yml: "yaml", sql: "sql",
      sh: "shell", xml: "xml", java: "java", c: "c", cpp: "cpp", cs: "csharp",
      rb: "ruby", php: "php", swift: "swift", lua: "lua",
    };
    const language = langMap[ext] ?? "plaintext";
    get().addNode({
      id: crypto.randomUUID(),
      type: "monaco",
      position: { x: 200 + Math.random() * 400, y: 100 + Math.random() * 300 },
      data: { type: "monaco", label: fileName, filePath, rootDir, language },
      style: { width: 600, height: 450 },
    });
  },

  save: async () => {
    if (!isElectron()) return;
    const { nodes, edges, viewport } = get();
    const data = JSON.stringify({ nodes, edges, viewport });
    try {
      await invoke("save_canvas", {
        id: CANVAS_ID,
        name: CANVAS_NAME,
        data,
      });
      set({ saveStatus: "saved" });
      if (savedResetTimer) clearTimeout(savedResetTimer);
      savedResetTimer = setTimeout(() => {
        useCanvasStore.setState({ saveStatus: "idle" });
      }, 2000);
    } catch (e) {
      console.error("canvas save failed:", e);
      set({ saveStatus: "idle" });
    }
  },

  load: async () => {
    if (!isElectron()) {
      set({ loaded: true });
      return;
    }
    try {
      const result = await invoke<{
        id: string;
        name: string;
        data: string;
        updated_at: string;
      } | null>("load_canvas", { id: CANVAS_ID });

      if (result) {
        const state = JSON.parse(result.data) as {
          nodes: Node[];
          edges: Edge[];
          viewport: Viewport;
        };
        // Sort: groups before children (React Flow parent ordering requirement)
        const sortedNodes = (state.nodes ?? []).sort((a, b) => {
          if (a.type === "group" && b.type !== "group") return -1;
          if (a.type !== "group" && b.type === "group") return 1;
          return 0;
        });
        set({
          nodes: sortedNodes,
          edges: state.edges ?? [],
          viewport: state.viewport ?? { x: 0, y: 0, zoom: 1 },
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    } catch (e) {
      console.error("canvas load failed:", e);
      set({ loaded: true });
    }
  },
}));

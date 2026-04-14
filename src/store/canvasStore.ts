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

interface CanvasStore {
  // State
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
  loaded: boolean;
  hibernatedGroups: string[];

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
  addTerminalNode: () => void;
  addNoteNode: () => void;
  addVSCodeNode: () => void;
  addObsidianNode: () => void;
  addBrowserNode: () => void;
  addKanbanNode: () => void;
  addApiNode: () => void;
  addDbNode: () => void;
  addGroupNode: () => void;

  // Persistence
  save: () => Promise<void>;
  load: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(store: CanvasStore) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.save();
  }, SAVE_DEBOUNCE_MS);
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  loaded: false,
  hibernatedGroups: [],

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
    scheduleSave(get());
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    const hasRemoval = changes.some((c) => c.type === "remove");
    if (hasRemoval) scheduleSave(get());
  },

  onConnect: (connection, stroke = "#7c3aed") => {
    set({
      edges: addEdge(
        { ...connection, animated: true, style: { stroke } },
        get().edges,
      ),
    });
    scheduleSave(get());
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
    scheduleSave(get());
  },

  addTerminalNode: () => {
    const count = get().nodes.filter((n) => n.type === "terminal").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "terminal",
      position: { x: 100 + Math.random() * 600, y: 100 + Math.random() * 400 },
      data: { type: "terminal", label: `Terminal ${count}`, role: "Agent" },
      style: { width: 520, height: 360 },
    });
  },

  addNoteNode: () => {
    const count = get().nodes.filter((n) => n.type === "note").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "note",
      position: { x: 50 + Math.random() * 400, y: 50 + Math.random() * 300 },
      data: { type: "note", label: `Note ${count}`, content: "", priority: 1, commandMode: false },
      style: { width: 350, height: 250 },
    });
  },

  addVSCodeNode: () => {
    const count = get().nodes.filter((n) => n.type === "vscode").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "vscode",
      position: { x: 50 + Math.random() * 300, y: 50 + Math.random() * 200 },
      data: { type: "vscode", label: `VS Code ${count}`, workspacePath: "" },
      style: { width: 700, height: 500 },
    });
  },

  addObsidianNode: () => {
    const count = get().nodes.filter((n) => n.type === "obsidian").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "obsidian",
      position: { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 },
      data: { type: "obsidian", label: `Vault ${count}`, vaultPath: "" },
      style: { width: 380, height: 400 },
    });
  },

  addBrowserNode: () => {
    const count = get().nodes.filter((n) => n.type === "browser").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "browser",
      position: { x: 60 + Math.random() * 400, y: 60 + Math.random() * 300 },
      data: { type: "browser", label: `Browser ${count}`, url: "" },
      style: { width: 800, height: 600 },
    });
  },

  addKanbanNode: () => {
    const count = get().nodes.filter((n) => n.type === "kanban").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "kanban",
      position: { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 },
      data: {
        type: "kanban",
        label: `Kanban ${count}`,
        columns: [
          { id: crypto.randomUUID(), title: "To Do", cards: [] },
          { id: crypto.randomUUID(), title: "Doing", cards: [] },
          { id: crypto.randomUUID(), title: "Done", cards: [] },
        ],
      },
      style: { width: 600, height: 450 },
    });
  },

  addApiNode: () => {
    const count = get().nodes.filter((n) => n.type === "api").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "api",
      position: { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 },
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

  addDbNode: () => {
    const count = get().nodes.filter((n) => n.type === "db").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "db",
      position: { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 },
      data: {
        type: "db",
        label: `Database ${count}`,
        query: "SELECT * FROM users LIMIT 10;",
      },
      style: { width: 550, height: 400 },
    });
  },

  addGroupNode: () => {
    const count = get().nodes.filter((n) => n.type === "group").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "group",
      position: { x: 50 + Math.random() * 200, y: 50 + Math.random() * 200 },
      data: { type: "group", label: `Project ${count}`, color: "#3b82f6" },
      style: { width: 1200, height: 800, zIndex: -1 },
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
    } catch (e) {
      console.error("canvas save failed:", e);
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

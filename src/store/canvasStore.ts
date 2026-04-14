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
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";

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
    if (removes.length > 0 && isTauri()) {
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

  save: async () => {
    if (!isTauri()) return;
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
    if (!isTauri()) {
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

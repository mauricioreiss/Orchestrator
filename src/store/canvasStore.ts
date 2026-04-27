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
  addKanbanNode: (position?: { x: number; y: number }) => void;
  addApiNode: (position?: { x: number; y: number }) => void;
  addDbNode: (position?: { x: number; y: number }) => void;
  addGroupNode: (position?: { x: number; y: number }) => void;
  addMarkdownNode: (position?: { x: number; y: number }) => void;
  addArchitectNode: (position?: { x: number; y: number }) => void;
  addGitNode: (position?: { x: number; y: number }) => void;
  addLogViewerNode: (position?: { x: number; y: number }) => void;
  addMonacoNode: (filePath: string, rootDir: string) => void;

  // Persistence
  save: () => Promise<void>;
  load: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savedResetTimer: ReturnType<typeof setTimeout> | null = null;

// ---------- Smart Spawn ----------
const COLLISION_TOLERANCE = 50;
const CASCADE_OFFSET = 40;
const MAX_CASCADE = 20;

/** Convert viewport center (screen pixels) to flow coordinates */
function viewportCenter(viewport: Viewport): { x: number; y: number } {
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const screenH = typeof window !== "undefined" ? window.innerHeight : 1080;
  return {
    x: (screenW / 2 - viewport.x) / viewport.zoom,
    y: (screenH / 2 - viewport.y) / viewport.zoom,
  };
}

/** Find a position free of collisions, cascading +40/+40 per overlap */
function findOpenPosition(
  nodes: Node[],
  base: { x: number; y: number },
  nodeW: number,
  nodeH: number,
): { x: number; y: number } {
  let pos = { ...base };
  for (let i = 0; i < MAX_CASCADE; i++) {
    const collision = nodes.some((n) => {
      const nw = (n.style?.width as number) ?? 300;
      const nh = (n.style?.height as number) ?? 200;
      const overlapX =
        pos.x < n.position.x + nw + COLLISION_TOLERANCE &&
        pos.x + nodeW > n.position.x - COLLISION_TOLERANCE;
      const overlapY =
        pos.y < n.position.y + nh + COLLISION_TOLERANCE &&
        pos.y + nodeH > n.position.y - COLLISION_TOLERANCE;
      return overlapX && overlapY;
    });
    if (!collision) return pos;
    pos = { x: pos.x + CASCADE_OFFSET, y: pos.y + CASCADE_OFFSET };
  }
  return pos;
}

/** Compute smart spawn position: viewport center, offset for node size, collision-free */
function smartSpawn(
  nodes: Node[],
  viewport: Viewport,
  nodeW: number,
  nodeH: number,
): { x: number; y: number } {
  const center = viewportCenter(viewport);
  // Offset so node CENTER aligns with viewport center
  const base = { x: center.x - nodeW / 2, y: center.y - nodeH / 2 };
  return findOpenPosition(nodes, base, nodeW, nodeH);
}

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
    const W = 520, H = 360;
    const count = get().nodes.filter((n) => n.type === "terminal").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "terminal",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: { type: "terminal", label: `Terminal ${count}`, role: "Agent" },
      style: { width: W, height: H },
    });
  },

  addNoteNode: (position?) => {
    const W = 350, H = 250;
    const count = get().nodes.filter((n) => n.type === "note").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "note",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: { type: "note", label: `Note ${count}`, content: "", priority: 1, commandMode: false },
      style: { width: W, height: H },
    });
  },

  addVSCodeNode: (position?) => {
    const W = 700, H = 500;
    const count = get().nodes.filter((n) => n.type === "vscode").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "vscode",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: { type: "vscode", label: `VS Code ${count}`, workspacePath: "" },
      style: { width: W, height: H },
    });
  },

  addObsidianNode: (position?) => {
    const W = 380, H = 400;
    const count = get().nodes.filter((n) => n.type === "obsidian").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "obsidian",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: { type: "obsidian", label: `Vault ${count}`, vaultPath: "" },
      style: { width: W, height: H },
    });
  },

  addKanbanNode: (position?) => {
    const W = 400, H = 400;
    const count = get().nodes.filter((n) => n.type === "kanban").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "kanban",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: {
        type: "kanban",
        label: `Tasks ${count}`,
        columns: [],
        tasks: [],
      },
      style: { width: W, height: H },
    });
  },

  addApiNode: (position?) => {
    const W = 450, H = 500;
    const count = get().nodes.filter((n) => n.type === "api").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "api",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: {
        type: "api",
        label: `API ${count}`,
        method: "GET",
        url: "",
        body: "",
        headers: [],
      },
      style: { width: W, height: H },
    });
  },

  addDbNode: (position?) => {
    const W = 550, H = 400;
    const count = get().nodes.filter((n) => n.type === "db").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "db",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: {
        type: "db",
        label: `Database ${count}`,
        query: "SELECT * FROM users LIMIT 10;",
      },
      style: { width: W, height: H },
    });
  },

  addGroupNode: (position?) => {
    const W = 1200, H = 800;
    const count = get().nodes.filter((n) => n.type === "group").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "group",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: { type: "group", label: `Project ${count}`, color: "#3b82f6" },
      style: { width: W, height: H, zIndex: -1 },
    });
  },

  addMarkdownNode: (position?) => {
    const W = 500, H = 400;
    const count = get().nodes.filter((n) => n.type === "markdown").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "markdown",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: { type: "markdown", label: `Markdown ${count}`, content: "" },
      style: { width: W, height: H },
    });
  },

  addArchitectNode: (position?) => {
    const W = 400, H = 500;
    const count = get().nodes.filter((n) => n.type === "architect").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "architect",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: { type: "architect", label: `Architect ${count}` },
      style: { width: W, height: H },
    });
  },

  addGitNode: (position?) => {
    const W = 400, H = 380;
    const count = get().nodes.filter((n) => n.type === "git").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "git",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: { type: "git", label: `Git ${count}` },
      style: { width: W, height: H },
    });
  },

  addLogViewerNode: (position?) => {
    const W = 550, H = 400;
    const count = get().nodes.filter((n) => n.type === "logviewer").length + 1;
    get().addNode({
      id: crypto.randomUUID(),
      type: "logviewer",
      position: position ?? smartSpawn(get().nodes, get().viewport, W, H),
      data: { type: "logviewer", label: `Log ${count}` },
      style: { width: W, height: H },
    });
  },

  addMonacoNode: (filePath: string, rootDir: string) => {
    const W = 600, H = 450;
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
      position: smartSpawn(get().nodes, get().viewport, W, H),
      data: { type: "monaco", label: fileName, filePath, rootDir, language },
      style: { width: W, height: H },
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

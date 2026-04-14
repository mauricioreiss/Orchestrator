// -- Tauri backend types --

export interface PtyInfo {
  id: string;
  label: string;
}

export interface CodeServerStatus {
  instance_id: string;
  running: boolean;
  ready: boolean;
  port: number;
  url: string;
  workspace: string;
  token: string;
  error_output: string | null;
}

export interface CodeServerDetection {
  found: boolean;
  path: string | null;
  source: string | null;
}

// -- Node data types (discriminated by `type` field) --

export interface TerminalNodeData {
  type: "terminal";
  label: string;
  role: string;
  cwd?: string;
  ptyId?: string;
  [key: string]: unknown;
}

export interface NoteNodeData {
  type: "note";
  label: string;
  content: string;
  priority: number;
  [key: string]: unknown;
}

export interface VSCodeNodeData {
  type: "vscode";
  label: string;
  workspacePath: string;
  [key: string]: unknown;
}

export interface ObsidianNodeData {
  type: "obsidian";
  label: string;
  vaultPath: string;
  selectedFile?: string;
  content?: string;
  [key: string]: unknown;
}

export interface GroupNodeData {
  type: "group";
  label: string;
  color: string;
  [key: string]: unknown;
}

export const GROUP_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b",
] as const;

export type CanvasNodeData =
  | TerminalNodeData
  | NoteNodeData
  | VSCodeNodeData
  | ObsidianNodeData
  | GroupNodeData;

// -- Vault types --

export interface VaultFile {
  name: string;
  relative_path: string;
  size: number;
  is_dir: boolean;
}

export interface VaultContent {
  relative_path: string;
  content: string;
  size: number;
}

// -- Vault search types --

export interface VaultSearchMatch {
  line_number: number;
  line_content: string;
}

export interface VaultSearchResult {
  name: string;
  relative_path: string;
  size: number;
  matches: VaultSearchMatch[];
}

// -- Graph sync types --

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceType: string;
  targetType: string;
}

export interface CanvasGraphNode {
  id: string;
  type: string;
  data: CanvasNodeData;
  parentId?: string | null;
}

export interface CanvasGraph {
  nodes: CanvasGraphNode[];
  edges: CanvasEdge[];
  version: number;
}

// -- Process supervisor types --

export interface CleanupResult {
  killed_ptys: number;
  stopped_servers: number;
}

// -- Sync response from backend --

export interface CwdUpdate {
  terminalNodeId: string;
  cwd: string;
}

export interface SyncResult {
  dispatched: number;
  interrupted: number;
  piped: number;
  leader_contexts: number;
  cwd_updates: CwdUpdate[];
}

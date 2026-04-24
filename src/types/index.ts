// -- Backend IPC types --

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
  autoApprove?: boolean;
  [key: string]: unknown;
}

export interface NoteNodeData {
  type: "note";
  label: string;
  content: string;
  priority: number;
  commandMode?: boolean;
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

export type CardPriority = "green" | "yellow" | "orange" | "red";

export interface KanbanCard {
  id: string;
  title: string;
  priority?: CardPriority;
  dueDate?: string; // ISO date YYYY-MM-DD
}

export interface KanbanColumn {
  id: string;
  title: string;
  color?: string;
  cards: KanbanCard[];
}

// -- Task management types --

export type TaskStatus = "todo" | "doing" | "done";

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate?: string; // ISO date YYYY-MM-DD
}

export interface KanbanNodeData {
  type: "kanban";
  label: string;
  columns: KanbanColumn[]; // legacy column-based data
  tasks?: TaskItem[]; // flat task list (primary)
  [key: string]: unknown;
}

export interface ApiNodeData {
  type: "api";
  label: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
  body: string;
  headers: { key: string; value: string }[];
  [key: string]: unknown;
}

export interface DbNodeData {
  type: "db";
  label: string;
  query: string;
  [key: string]: unknown;
}

export interface MonacoNodeData {
  type: "monaco";
  label: string;
  filePath: string;
  rootDir: string;
  language: string;
  [key: string]: unknown;
}

export interface MarkdownNodeData {
  type: "markdown";
  label: string;
  content: string;
  [key: string]: unknown;
}

export interface PersonaFile {
  name: string;
  content: string;
}

export interface ArchitectNodeData {
  type: "architect";
  label: string;
  cwd?: string;
  messages?: ChatMessage[];
  personaFiles?: PersonaFile[]; // multi-agent persona files
  savedPaths?: string[]; // paths where files were saved
  [key: string]: unknown;
}

export interface GlobalMonitorNodeData {
  type: "globalmonitor";
  label: string;
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
  | GroupNodeData
  | KanbanNodeData
  | ApiNodeData
  | DbNodeData
  | MonacoNodeData
  | MarkdownNodeData
  | ArchitectNodeData
  | GlobalMonitorNodeData;

// -- Persona Architect types --

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DossierResult {
  dossier: string;
  ignitionPrompt: string;
}

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

// -- Translator types --

export interface TranslateResult {
  command: string;
  provider: string;
  model: string;
}

/**
 * Snapshot of a node that the orchestrator can command. Built on the
 * frontend from fresh Zustand state at the moment of the IPC call, so the
 * AI always sees the current graph (no staleness from debounced sync).
 */
export interface ConnectedNodeInfo {
  label: string;
  type: string;
  cwd?: string;
  ptyId?: string;
}

// -- Proxy types --

export interface ProxyStatus {
  instance_id: string;
  proxy_port: number;
  target_port: number;
  running: boolean;
}

// -- System monitoring types --

export interface SystemMetrics {
  cpu_usage: number;
  memory_used: number;
  memory_total: number;
  memory_percent: number;
  active_ptys: number;
  active_code_servers: number;
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

// -- File system types (FileSystemService) --

export interface FsEntry {
  name: string;
  relative_path: string;
  size: number;
  is_dir: boolean;
}

export interface FsFileContent {
  relative_path: string;
  content: string;
  size: number;
  language: string;
}

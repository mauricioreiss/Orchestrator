// Shared types for Electron main process — mirrors src/types/index.ts

export interface PtyInfo {
  id: string;
  label: string;
}

export interface CodeServerDetection {
  found: boolean;
  path: string | null;
  source: string | null;
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

export interface ProxyStatus {
  instance_id: string;
  proxy_port: number;
  target_port: number;
  running: boolean;
}

export interface SystemMetrics {
  cpu_usage: number;
  memory_used: number;
  memory_total: number;
  memory_percent: number;
  active_ptys: number;
  active_code_servers: number;
}

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

export interface SavedCanvas {
  id: string;
  name: string;
  data: string;
  updated_at: string;
}

export interface CanvasSummary {
  id: string;
  name: string;
  updated_at: string;
}

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

export interface CleanupResult {
  killed_ptys: number;
  stopped_servers: number;
}

// Context types
export interface CanvasGraph {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  version: number;
}

export interface CanvasNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  parentId?: string;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceType: string;
  targetType: string;
}

export interface SyncResult {
  dispatched: number;
  interrupted: number;
  piped: number;
  leader_contexts: number;
  cwd_updates: number;
}

export type ContextAction =
  | { type: "dispatch_note"; ptyId: string; noteId: string; terminalId: string; content: string; priority: number; isLeaderContext: boolean }
  | { type: "interrupt"; ptyId: string }
  | { type: "clear_instruction"; ptyId: string }
  | { type: "set_cwd"; terminalNodeId: string; ptyId?: string; cwd: string }
  | { type: "pipe_output"; sourcePtyId: string; targetPtyId: string };

export interface RemovedNode {
  node_id: string;
  node_type: string;
  process_id?: string;
}

// File system types (FileSystemService)
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

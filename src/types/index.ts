// -- Tauri backend types --

export interface PtyInfo {
  id: string;
  label: string;
}

export interface CodeServerStatus {
  running: boolean;
  port: number;
  url: string;
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

export type CanvasNodeData = TerminalNodeData | NoteNodeData | VSCodeNodeData;

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
}

export interface CanvasGraph {
  nodes: CanvasGraphNode[];
  edges: CanvasEdge[];
  version: number;
}

// -- Sync response from backend --

export interface CwdUpdate {
  terminalNodeId: string;
  cwd: string;
}

export interface SyncResult {
  dispatched: number;
  interrupted: number;
  cwd_updates: CwdUpdate[];
}

export interface PtyInfo {
  id: string;
  label: string;
}

export interface CodeServerStatus {
  running: boolean;
  port: number;
  url: string;
}

export interface TerminalNodeData {
  label: string;
  role?: string;
  cwd?: string;
  [key: string]: unknown;
}

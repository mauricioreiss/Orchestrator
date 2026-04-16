import { useState, useCallback } from "react";
import { invoke } from "../lib/electron";
import { isElectron } from "../lib/electron";
import { useCanvasStore } from "../store/canvasStore";
import type {
  ConnectedNodeInfo,
  TerminalNodeData,
  TranslateResult,
} from "../types";

export type TranslatorStatus = "idle" | "translating" | "success" | "error";

interface UseTranslatorReturn {
  status: TranslatorStatus;
  lastCommand: string | null;
  error: string | null;
  /**
   * `orchestratorNodeId` is the React Flow node id of the terminal that will
   * act as the orchestrator (receives the AI response).
   * `subordinates` is the pre-built list of terminals the AI can SEND_TO.
   * When provided, edge-walking is skipped (the caller already resolved them).
   */
  translate: (
    noteContent: string,
    ptyId: string,
    cwd: string,
    role: string,
    orchestratorNodeId: string,
    subordinates?: ConnectedNodeInfo[],
  ) => Promise<TranslateResult | null>;
}

/**
 * Extract a label + path for any node type the orchestrator can command.
 * Returns null for types we don't want to expose to the AI (groups, etc).
 */
function toConnectedNodeInfo(
  node: { id: string; type?: string; data?: Record<string, unknown> },
): ConnectedNodeInfo | null {
  const type = node.type ?? "";
  const data = (node.data ?? {}) as Record<string, unknown>;
  const label = typeof data.label === "string" ? data.label : null;
  if (!label) return null;

  // Pull the most relevant path field per node type
  let cwd: string | undefined;
  if (type === "terminal") cwd = (data as TerminalNodeData).cwd;
  else if (type === "vscode" && typeof data.workspacePath === "string") cwd = data.workspacePath;
  else if (type === "workspace" && typeof data.path === "string") cwd = data.path;
  else if (type === "obsidian" && typeof data.vaultPath === "string") cwd = data.vaultPath;

  const ptyId = typeof data.ptyId === "string" ? data.ptyId : undefined;

  // Skip groups and other non-actionable nodes
  if (type === "group" || !type) return null;

  return { label, type, cwd, ptyId };
}

export function useTranslator(): UseTranslatorReturn {
  const [status, setStatus] = useState<TranslatorStatus>("idle");
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const translate = useCallback(
    async (
      noteContent: string,
      ptyId: string,
      cwd: string,
      role: string,
      orchestratorNodeId: string,
      subordinates?: ConnectedNodeInfo[],
    ): Promise<TranslateResult | null> => {
      if (!isElectron()) return null;
      if (!noteContent.trim()) {
        setError("Note is empty");
        setStatus("error");
        return null;
      }

      // Use pre-built subordinate list when provided (NoteNode is the hub and
      // already resolved the full list). Fall back to edge-walking only when
      // the caller didn't provide subordinates.
      let connectedNodes: ConnectedNodeInfo[];
      if (subordinates && subordinates.length > 0) {
        connectedNodes = subordinates;
      } else {
        const { nodes, edges } = useCanvasStore.getState();
        connectedNodes = [];
        const seen = new Set<string>();
        for (const edge of edges) {
          let neighborId: string | null = null;
          if (edge.source === orchestratorNodeId) neighborId = edge.target;
          else if (edge.target === orchestratorNodeId) neighborId = edge.source;
          if (!neighborId) continue;
          if (seen.has(neighborId)) continue;
          seen.add(neighborId);
          const neighborNode = nodes.find((n) => n.id === neighborId);
          if (!neighborNode || neighborNode.type !== "terminal") continue;
          const info = toConnectedNodeInfo(neighborNode);
          if (info && info.ptyId) connectedNodes.push(info);
        }
      }

      setStatus("translating");
      setError(null);
      setLastCommand(null);

      try {
        const result = await invoke<TranslateResult>("translate_and_inject", {
          noteContent,
          ptyId,
          cwd,
          role,
          connectedNodes,
        });
        setLastCommand(result.command);
        setStatus("success");
        setTimeout(() => setStatus("idle"), 3000);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 5000);
        return null;
      }
    },
    [],
  );

  return { status, lastCommand, error, translate };
}

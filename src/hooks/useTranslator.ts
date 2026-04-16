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
   * `orchestratorNodeId` is the React Flow node id of the node that will
   * act as the orchestrator (typically the terminal receiving the note).
   * Outgoing edges from this node define the subordinates visible to the AI.
   */
  translate: (
    noteContent: string,
    ptyId: string,
    cwd: string,
    role: string,
    orchestratorNodeId: string,
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
    ): Promise<TranslateResult | null> => {
      if (!isElectron()) return null;
      if (!noteContent.trim()) {
        setError("Note is empty");
        setStatus("error");
        return null;
      }

      // Snapshot Zustand state NOW — no subscription, no staleness.
      const { nodes, edges } = useCanvasStore.getState();

      // Bidirectional: any edge touching the orchestrator defines a subordinate,
      // regardless of draw direction. Skip the note itself (it's the caller).
      const connectedNodes: ConnectedNodeInfo[] = [];
      const seen = new Set<string>();
      for (const edge of edges) {
        let neighborId: string | null = null;
        if (edge.source === orchestratorNodeId) neighborId = edge.target;
        else if (edge.target === orchestratorNodeId) neighborId = edge.source;
        if (!neighborId) continue;
        if (seen.has(neighborId)) continue;
        seen.add(neighborId);
        const neighborNode = nodes.find((n) => n.id === neighborId);
        if (!neighborNode) continue;
        // Only expose terminals with a live ptyId — the AI can only SEND_TO
        // terminals running interactive CLIs. Skip notes, vscode, browser, etc.
        if (neighborNode.type !== "terminal") continue;
        const info = toConnectedNodeInfo(neighborNode);
        if (info && info.ptyId) connectedNodes.push(info);
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

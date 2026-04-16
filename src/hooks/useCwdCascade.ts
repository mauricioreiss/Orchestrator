import { useEffect, useRef } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useCanvasStore } from "../store/canvasStore";
import type { TerminalNodeData, WorkspaceNodeData } from "../types";

/**
 * Maps each node type to the field inside its `data` object that holds the
 * working directory (or analogous path). These fields are the "source of
 * truth" for cascading context downstream.
 */
const PATH_KEY_BY_TYPE: Record<string, string> = {
  vscode: "workspacePath",
  terminal: "cwd",
  workspace: "path",
  obsidian: "vaultPath",
};

function getNodePath(node: Node): string | undefined {
  const key = PATH_KEY_BY_TYPE[node.type ?? ""];
  if (!key) return undefined;
  const val = (node.data as Record<string, unknown>)?.[key];
  return typeof val === "string" && val.length > 0 ? val : undefined;
}

/**
 * Deep CWD Sync.
 *
 * Reactively propagates `cwd` / `path` from source nodes to directly
 * connected terminal/workspace targets. Triggers:
 *
 *   1. A new edge is added whose source has a path  -> cascade to target.
 *   2. A tracked source node's path field mutates   -> cascade to targets.
 *
 * The cascade is naturally recursive: when the effect writes the new cwd
 * into a terminal target, Zustand re-emits the nodes array; the effect
 * re-runs, detects that terminal's cwd has now "changed", and cascades
 * further down the chain. Convergence is guaranteed because we skip writes
 * when the target already has the correct value.
 *
 * Live PTY directory changes are handled by each TerminalNode reactively
 * via a useEffect on its own `data.cwd`. This hook only mutates the graph
 * state; the terminal component is responsible for sending the live `cd`.
 */
export function useCwdCascade() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const { setNodes } = useReactFlow();

  const prevPathsRef = useRef<Map<string, string>>(new Map());
  const prevEdgeIdsRef = useRef<Set<string>>(new Set());
  const firstRunRef = useRef(true);

  useEffect(() => {
    // Build current path snapshot
    const currentPaths = new Map<string, string>();
    for (const n of nodes) {
      const p = getNodePath(n);
      if (p) currentPaths.set(n.id, p);
    }

    // Detect sources needing cascade
    const sourcesToCascade = new Set<string>();

    // 1) Newly-added edges: cascade their source
    const currentEdgeIds = new Set<string>();
    for (const e of edges) {
      currentEdgeIds.add(e.id);
      if (!prevEdgeIdsRef.current.has(e.id) && !firstRunRef.current) {
        sourcesToCascade.add(e.source);
      }
    }

    // 2) Mutated source paths: cascade the changed source
    if (!firstRunRef.current) {
      for (const [id, path] of currentPaths) {
        if (prevPathsRef.current.get(id) !== path) {
          sourcesToCascade.add(id);
        }
      }
    }

    prevPathsRef.current = currentPaths;
    prevEdgeIdsRef.current = currentEdgeIds;
    firstRunRef.current = false;

    if (sourcesToCascade.size === 0) return;

    // Collect graph-state updates (data.cwd / data.path only).
    // Live PTY `cd` is issued by each TerminalNode's own useEffect.
    const updates = new Map<string, { cwd?: string; path?: string }>();

    for (const sourceId of sourcesToCascade) {
      const sourceNode = nodes.find((n) => n.id === sourceId);
      if (!sourceNode) continue;
      const sourcePath = getNodePath(sourceNode);
      if (!sourcePath) continue;

      for (const edge of edges) {
        if (edge.source !== sourceId) continue;
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!targetNode) continue;

        if (targetNode.type === "terminal") {
          const currentCwd = (targetNode.data as TerminalNodeData)?.cwd;
          if (currentCwd === sourcePath) continue;
          const prev = updates.get(targetNode.id) ?? {};
          updates.set(targetNode.id, { ...prev, cwd: sourcePath });
        } else if (targetNode.type === "workspace") {
          const currentPath = (targetNode.data as WorkspaceNodeData)?.path;
          if (currentPath === sourcePath) continue;
          const prev = updates.get(targetNode.id) ?? {};
          updates.set(targetNode.id, { ...prev, path: sourcePath });
        }
      }
    }

    if (updates.size > 0) {
      setNodes((nds) =>
        nds.map((n) => {
          const update = updates.get(n.id);
          if (!update) return n;
          return { ...n, data: { ...n.data, ...update } };
        }),
      );
    }
  }, [nodes, edges, setNodes]);
}

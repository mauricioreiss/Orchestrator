import { useCallback, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { invoke } from "../lib/electron";
import { isElectron } from "../lib/electron";
import type { CanvasGraph, CanvasEdge, SyncResult } from "../types";

const DEBOUNCE_MS = 150;

export function useCanvasSync() {
  const { getNodes, getEdges } = useReactFlow();
  const versionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    const nodes = getNodes();
    const edges = getEdges();

    const graph: CanvasGraph = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? "terminal",
        data: n.data as CanvasGraph["nodes"][number]["data"],
        parentId: (n.parentId as string) ?? null,
      })),
      edges: edges.map((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source);
        const targetNode = nodes.find((n) => n.id === e.target);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceType: sourceNode?.type ?? "unknown",
          targetType: targetNode?.type ?? "unknown",
        } as CanvasEdge;
      }),
      version: ++versionRef.current,
    };

    if (!isElectron()) return null;

    try {
      const result = await invoke<SyncResult>("sync_canvas", { graph });
      return result;
    } catch (err) {
      const msg = String(err);
      if (!msg.includes("not found")) {
        console.error("[maestri-x] sync_canvas failed:", err);
      }
      return null;
    }
  }, [getNodes, getEdges]);

  const syncDebounced = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(syncNow, DEBOUNCE_MS);
  }, [syncNow]);

  return { syncNow, syncDebounced };
}

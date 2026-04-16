import { useEffect, useRef } from "react";
import { listen, isElectron } from "../lib/electron";
import { useCanvasStore } from "../store/canvasStore";

interface SwarmDispatchEvent {
  sourcePtyId: string;
  sourceNodeId: string;
  targetNodeId: string;
  targetLabel: string;
  command: string;
}

/**
 * Visual-only listener for swarm-dispatch events.
 * All routing logic lives in the backend (PtyService.routeToTarget).
 * This hook only flashes the affected edges with "dispatching" status.
 */
export function useSwarmRouter(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isElectron()) return;

    const unlisten = listen<SwarmDispatchEvent>("swarm-dispatch", (payload) => {
      const { sourceNodeId, targetNodeId, targetLabel, command } = payload;
      const store = useCanvasStore.getState();

      // Find edge(s) between source and target (either direction)
      const edgeIds = store.edges
        .filter(
          (e) =>
            (e.source === sourceNodeId && e.target === targetNodeId) ||
            (e.source === targetNodeId && e.target === sourceNodeId),
        )
        .map((e) => e.id);

      if (edgeIds.length === 0) return;

      console.log(`[swarm] Dispatched to "${targetLabel}": ${command}`);

      // Flash edges with "dispatching" status (cyan glow)
      store.setEdges((edges) =>
        edges.map((e) =>
          edgeIds.includes(e.id)
            ? { ...e, data: { ...(e.data ?? {}), status: "dispatching" } }
            : e,
        ),
      );

      // Reset after 1.5s
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        useCanvasStore.getState().setEdges((edges) =>
          edges.map((e) =>
            edgeIds.includes(e.id)
              ? { ...e, data: { ...(e.data ?? {}), status: "idle" } }
              : e,
          ),
        );
      }, 1500);
    });

    return () => {
      unlisten();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}

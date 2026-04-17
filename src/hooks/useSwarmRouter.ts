import { useEffect, useRef } from "react";
import { listen, isElectron } from "../lib/electron";
import { useCanvasStore } from "../store/canvasStore";

interface SwarmDispatchEvent {
  targetPtyId: string;
  targetLabel: string;
  command: string;
}

/**
 * Visual-only listener for swarm-dispatch events.
 * All routing logic lives in the backend (TranslatorService).
 * This hook only flashes the affected edges with "dispatching" status.
 */
export function useSwarmRouter(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isElectron()) return;

    const unlisten = listen<SwarmDispatchEvent>("swarm-dispatch", (payload) => {
      const { targetPtyId, targetLabel, command } = payload;
      const store = useCanvasStore.getState();

      // Find the target node by ptyId
      const targetNode = store.nodes.find(
        (n) => n.type === "terminal" && (n.data as Record<string, unknown>)?.ptyId === targetPtyId,
      );
      if (!targetNode) return;

      // Flash ALL edges touching the target node (bidirectional)
      const edgeIds = store.edges
        .filter(
          (e) => e.source === targetNode.id || e.target === targetNode.id,
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

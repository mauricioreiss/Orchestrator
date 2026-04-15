import { useEffect, useRef } from "react";
import { listen, isElectron } from "../lib/electron";
import { useCanvasStore } from "../store/canvasStore";

interface BroadcastEvent {
  source: string;
  targets: string[];
  command: string;
}

/**
 * Listens for PTY broadcast events and flashes the affected edges
 * with a "broadcasting" status for visual feedback.
 */
export function useBroadcast(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isElectron()) return;

    const unlisten = listen<BroadcastEvent>("pty-broadcast", (payload) => {
      const { source, targets } = payload;
      const store = useCanvasStore.getState();

      // Find edges from source to any of the broadcast targets
      const broadcastEdgeIds = store.edges
        .filter((e) => e.source === source && targets.includes(e.target))
        .map((e) => e.id);

      if (broadcastEdgeIds.length === 0) return;

      // Set edges to "broadcasting" status
      store.setEdges((edges) =>
        edges.map((e) =>
          broadcastEdgeIds.includes(e.id)
            ? { ...e, data: { ...(e.data ?? {}), status: "broadcasting" } }
            : e,
        ),
      );

      // Reset after 1.5s
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const current = useCanvasStore.getState();
        current.setEdges((edges) =>
          edges.map((e) =>
            broadcastEdgeIds.includes(e.id)
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

import { useRef, useEffect, useCallback } from "react";
import { useReactFlow, useOnViewportChange } from "@xyflow/react";
import { invoke } from "../lib/electron";
import { isElectron } from "../lib/electron";
import { useCanvasStore } from "../store/canvasStore";
import type { TerminalNodeData } from "../types";

const HIBERNATE_DELAY_MS = 30_000;

interface GroupTracker {
  timer: ReturnType<typeof setTimeout> | null;
  hibernated: boolean;
}

export function useHibernation() {
  const { getNodes } = useReactFlow();
  const setHibernatedGroups = useCanvasStore((s) => s.setHibernatedGroups);

  const trackersRef = useRef<Map<string, GroupTracker>>(new Map());
  const containerRef = useRef<{ width: number; height: number }>({
    width: 1200,
    height: 800,
  });

  // Observe the React Flow container size
  useEffect(() => {
    const el = document.querySelector(".react-flow") as HTMLElement | null;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    containerRef.current = { width: rect.width, height: rect.height };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerRef.current = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hibernateGroup = useCallback(
    (groupId: string) => {
      const tracker = trackersRef.current.get(groupId);
      if (tracker) tracker.hibernated = true;

      const nodes = getNodes();
      const children = nodes.filter(
        (n) => (n.parentId as string) === groupId,
      );

      if (isElectron()) {
        for (const child of children) {
          if (child.type === "terminal") {
            const ptyId = (child.data as TerminalNodeData)?.ptyId;
            if (ptyId) {
              invoke("kill_pty", { id: ptyId }).catch(() => {});
            }
          } else if (child.type === "vscode") {
            invoke("stop_code_server", { instanceId: child.id }).catch(() => {});
          }
        }
      }

      setHibernatedGroups((prev) =>
        prev.includes(groupId) ? prev : [...prev, groupId],
      );
    },
    [getNodes, setHibernatedGroups],
  );

  const wakeGroup = useCallback(
    (groupId: string) => {
      const tracker = trackersRef.current.get(groupId);
      if (tracker) tracker.hibernated = false;

      // Removing from hibernatedGroups triggers usePty/useCodeServer re-mount
      setHibernatedGroups((prev) => prev.filter((id) => id !== groupId));
    },
    [setHibernatedGroups],
  );

  const checkVisibility = useCallback(
    (vpX: number, vpY: number, vpZoom: number) => {
      const nodes = getNodes();
      const groups = nodes.filter((n) => n.type === "group");

      const { width: cw, height: ch } = containerRef.current;

      // Viewport bounds in canvas coordinates
      const viewLeft = -vpX / vpZoom;
      const viewTop = -vpY / vpZoom;
      const viewRight = viewLeft + cw / vpZoom;
      const viewBottom = viewTop + ch / vpZoom;

      for (const group of groups) {
        const gx = group.position.x;
        const gy = group.position.y;
        const gw = (group.style?.width as number) ?? 1200;
        const gh = (group.style?.height as number) ?? 800;

        // AABB intersection test
        const visible =
          gx + gw > viewLeft &&
          gx < viewRight &&
          gy + gh > viewTop &&
          gy < viewBottom;

        let tracker = trackersRef.current.get(group.id);
        if (!tracker) {
          tracker = { timer: null, hibernated: false };
          trackersRef.current.set(group.id, tracker);
        }

        if (visible) {
          // Group is visible: cancel any pending hibernate, wake if needed
          if (tracker.timer) {
            clearTimeout(tracker.timer);
            tracker.timer = null;
          }
          if (tracker.hibernated) {
            wakeGroup(group.id);
          }
        } else {
          // Group is offscreen: start timer if not already hibernated/pending
          if (!tracker.hibernated && !tracker.timer) {
            tracker.timer = setTimeout(() => {
              tracker!.timer = null;
              hibernateGroup(group.id);
            }, HIBERNATE_DELAY_MS);
          }
        }
      }

      // Clean up trackers for deleted groups
      const groupIds = new Set(groups.map((g) => g.id));
      for (const [id, tracker] of trackersRef.current) {
        if (!groupIds.has(id)) {
          if (tracker.timer) clearTimeout(tracker.timer);
          trackersRef.current.delete(id);
        }
      }
    },
    [getNodes, hibernateGroup, wakeGroup],
  );

  // React to viewport changes (pan/zoom)
  useOnViewportChange({
    onEnd: (vp) => {
      checkVisibility(vp.x, vp.y, vp.zoom);
    },
  });

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const tracker of trackersRef.current.values()) {
        if (tracker.timer) clearTimeout(tracker.timer);
      }
    };
  }, []);
}

import { useCallback, useRef, useEffect } from "react";
import {
  useReactFlow,
  useOnViewportChange,
  type Viewport,
} from "@xyflow/react";
import { useCanvasStore } from "../store/canvasStore";

const PADDING = 500; // canvas-space pixels beyond viewport to pre-render

export function useViewportCulling() {
  const { getNodes } = useReactFlow();
  const setNodes = useCanvasStore((s) => s.setNodes);
  const containerRef = useRef({ width: 1400, height: 900 });

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

  const cull = useCallback(
    (vp: Viewport) => {
      const { width: cw, height: ch } = containerRef.current;
      const viewLeft = -vp.x / vp.zoom - PADDING;
      const viewTop = -vp.y / vp.zoom - PADDING;
      const viewRight = viewLeft + cw / vp.zoom + PADDING * 2;
      const viewBottom = viewTop + ch / vp.zoom + PADDING * 2;

      const nodes = getNodes();
      let changed = false;

      const updated = nodes.map((node) => {
        // Never hide groups (they contain children)
        if (node.type === "group") return node;

        let absX = node.position.x;
        let absY = node.position.y;
        if (node.parentId) {
          const parent = nodes.find((n) => n.id === node.parentId);
          if (parent) {
            absX += parent.position.x;
            absY += parent.position.y;
          }
        }

        const w = (node.style?.width as number) ?? 300;
        const h = (node.style?.height as number) ?? 200;
        const visible =
          absX + w > viewLeft &&
          absX < viewRight &&
          absY + h > viewTop &&
          absY < viewBottom;
        const shouldHide = !visible;

        if (node.hidden !== shouldHide) {
          changed = true;
          return { ...node, hidden: shouldHide };
        }
        return node;
      });

      if (changed) setNodes(updated);
    },
    [getNodes, setNodes],
  );

  useOnViewportChange({ onEnd: cull });
}

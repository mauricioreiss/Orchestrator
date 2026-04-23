import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCanvasStore } from "../store/canvasStore";
import type { KanbanNodeData } from "../types";

const INTERVAL_MS = 60_000; // 1 minute

/**
 * Scans all KanbanNodes every minute looking for overdue or same-day tasks.
 * Only fires for tasks with status !== "done".
 * Tracks notified card IDs per day to avoid spam.
 */
export function useTaskWatcher() {
  const notifiedRef = useRef<Set<string>>(new Set());
  const lastDateRef = useRef<string>("");

  useEffect(() => {
    function check() {
      const todayISO = new Date().toISOString().slice(0, 10);

      // Reset the notified set when the calendar day changes
      if (todayISO !== lastDateRef.current) {
        notifiedRef.current.clear();
        lastDateRef.current = todayISO;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayMs = today.getTime();

      const nodes = useCanvasStore.getState().nodes;
      const kanbanNodes = nodes.filter((n) => n.type === "kanban");

      for (const node of kanbanNodes) {
        const data = node.data as KanbanNodeData;
        const tasks = data.tasks ?? [];
        const boardLabel = data.label ?? "Tasks";

        for (const task of tasks) {
          if (!task.dueDate) continue;
          if (task.status === "done") continue;

          const key = `${task.id}:${todayISO}`;
          if (notifiedRef.current.has(key)) continue;

          const due = new Date(task.dueDate + "T00:00:00");
          const dueMs = due.getTime();

          if (dueMs < todayMs) {
            notifiedRef.current.add(key);
            toast.error(`ATRASO: "${task.title}" esta fora do prazo!`, {
              description: `${boardLabel} — venceu em ${formatDate(task.dueDate)}`,
              duration: 8000,
            });
          } else if (dueMs === todayMs) {
            notifiedRef.current.add(key);
            toast.warning(`Lembrete: "${task.title}" vence hoje!`, {
              description: boardLabel,
              duration: 6000,
            });
          }
        }
      }
    }

    check();
    const timer = setInterval(check, INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

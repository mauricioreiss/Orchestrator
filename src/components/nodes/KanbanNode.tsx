import { memo, useState, useCallback } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import type { KanbanNodeData, TaskItem, TaskStatus } from "../../types";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import { useShallow } from "zustand/react/shallow";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#10b981";
const HANDLES = [
  { id: "top", type: "target" as const, position: Position.Top, color: "#10b981" },
  { id: "bottom", type: "source" as const, position: Position.Bottom, color: "#10b981" },
  { id: "left", type: "target" as const, position: Position.Left, color: "#10b981" },
  { id: "right", type: "source" as const, position: Position.Right, color: "#10b981" },
];

const STATUS_CYCLE: TaskStatus[] = ["todo", "doing", "done"];

const STATUS_STYLE: Record<TaskStatus, { label: string; color: string; bg: string; border: string }> = {
  todo: { label: "TODO", color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.3)" },
  doing: { label: "DOING", color: "#3b82f6", bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.3)" },
  done: { label: "DONE", color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)" },
};

function getDueDateColor(task: TaskItem): string {
  if (!task.dueDate) return "var(--mx-text-muted)";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate + "T00:00:00");
  if (task.status === "done") return "#10b981"; // green strikethrough look
  if (due.getTime() < today.getTime()) return "#ef4444"; // overdue = red
  if (due.getTime() === today.getTime()) return "#eab308"; // today = yellow
  return "var(--mx-text-muted)";
}

function formatDueDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function isOverdue(task: TaskItem): boolean {
  if (!task.dueDate || task.status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.dueDate + "T00:00:00").getTime() < today.getTime();
}

function isToday(task: TaskItem): boolean {
  if (!task.dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.dueDate + "T00:00:00").getTime() === today.getTime();
}

function KanbanNode({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as KanbanNodeData;
  const label = nodeData.label ?? "Tasks";
  const tasks: TaskItem[] = nodeData.tasks ?? [];

  const hibernatedGroups = useCanvasStore(useShallow((s) => s.hibernatedGroups));
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");

  const updateTasks = useCallback(
    (updater: (tasks: TaskItem[]) => TaskItem[]) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const current = (n.data as KanbanNodeData).tasks ?? [];
          return { ...n, data: { ...n.data, tasks: updater(current) } };
        }),
      );
      syncDebounced();
    },
    [id, setNodes, syncDebounced],
  );

  const addTask = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;
    const task: TaskItem = {
      id: crypto.randomUUID(),
      title,
      status: "todo",
      dueDate: newDate.trim() || undefined,
    };
    updateTasks((t) => [...t, task]);
    setNewTitle("");
    setNewDate("");
  }, [newTitle, newDate, updateTasks]);

  const cycleStatus = useCallback(
    (taskId: string) => {
      updateTasks((tasks) =>
        tasks.map((t) => {
          if (t.id !== taskId) return t;
          const idx = STATUS_CYCLE.indexOf(t.status);
          const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
          return { ...t, status: next };
        }),
      );
    },
    [updateTasks],
  );

  const removeTask = useCallback(
    (taskId: string) => {
      updateTasks((tasks) => tasks.filter((t) => t.id !== taskId));
    },
    [updateTasks],
  );

  const setTaskDueDate = useCallback(
    (taskId: string, dueDate: string | undefined) => {
      updateTasks((tasks) =>
        tasks.map((t) => (t.id === taskId ? { ...t, dueDate: dueDate || undefined } : t)),
      );
    },
    [updateTasks],
  );

  const todoCount = tasks.filter((t) => t.status === "todo").length;
  const doingCount = tasks.filter((t) => t.status === "doing").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const overdueCount = tasks.filter((t) => isOverdue(t)).length;

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={350}
        minHeight={300}
        label={label}
        badges={
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            sleep
          </span>
        }
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm" style={{ color: "var(--mx-text-muted)" }}>Hibernated</span>
        </div>
      </NodeWrapper>
    );
  }

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={BORDER_COLOR}
      minWidth={350}
      minHeight={300}
      label={label}
      badges={
        <>
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            {tasks.length} tasks
          </span>
          {overdueCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-red-500/20 text-red-400 border-red-500/30">
              {overdueCount} overdue
            </span>
          )}
        </>
      }
      statusLeft={`${todoCount}T ${doingCount}D ${doneCount}✓`}
      statusRight={<span style={{ color: "rgba(16,185,129,0.6)" }}>tasks</span>}
      handles={HANDLES}
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 nodrag nowheel">
          {tasks.length === 0 && (
            <div className="flex items-center justify-center py-6">
              <span className="text-[11px]" style={{ color: "var(--mx-text-muted)" }}>
                Nenhuma tarefa. Adicione abaixo.
              </span>
            </div>
          )}
          {tasks.map((task) => {
            const st = STATUS_STYLE[task.status];
            const overdue = isOverdue(task);
            const today = isToday(task);
            const dateColor = getDueDateColor(task);

            return (
              <div
                key={task.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded group transition-colors"
                style={{
                  background: overdue ? "rgba(239,68,68,0.05)" : "var(--mx-glass-bg)",
                  border: `1px solid ${overdue ? "rgba(239,68,68,0.2)" : today && task.status !== "done" ? "rgba(234,179,8,0.2)" : "var(--mx-glass-border)"}`,
                }}
              >
                {/* Status badge (click to cycle) */}
                <button
                  onClick={() => cycleStatus(task.id)}
                  className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded cursor-pointer transition-colors"
                  style={{
                    color: st.color,
                    background: st.bg,
                    border: `1px solid ${st.border}`,
                  }}
                  title="Click to change status"
                >
                  {st.label}
                </button>

                {/* Title */}
                <span
                  className="flex-1 text-[11px] break-words min-w-0"
                  style={{
                    color: task.status === "done" ? "var(--mx-text-muted)" : "var(--mx-text)",
                    textDecoration: task.status === "done" ? "line-through" : "none",
                  }}
                >
                  {task.title}
                </span>

                {/* Due date */}
                {task.dueDate && (
                  <span
                    className="shrink-0 text-[9px] font-mono"
                    style={{ color: dateColor }}
                    title={overdue ? "Atrasada!" : today ? "Vence hoje!" : task.dueDate}
                  >
                    {overdue && "!! "}
                    {formatDueDate(task.dueDate)}
                  </span>
                )}

                {/* Date picker (hidden, for adding date to tasks without one) */}
                {!task.dueDate && (
                  <input
                    type="date"
                    value=""
                    onChange={(e) => setTaskDueDate(task.id, e.target.value)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] bg-transparent outline-none"
                    style={{ color: "var(--mx-text-muted)", width: 22, colorScheme: "dark" }}
                    title="Set due date"
                  />
                )}

                {/* Remove */}
                <button
                  onClick={() => removeTask(task.id)}
                  className="shrink-0 text-[9px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove task"
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>

        {/* Add task input */}
        <div
          className="shrink-0 flex items-center gap-1.5 p-2 nodrag"
          style={{ borderTop: "1px solid var(--mx-border)" }}
        >
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
            placeholder="Nova tarefa..."
            className="flex-1 text-[11px] px-2 py-1 rounded border outline-none"
            style={{
              background: "var(--mx-input-bg)",
              borderColor: "var(--mx-input-border)",
              color: "var(--mx-text)",
            }}
            spellCheck={false}
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="text-[9px] px-1 py-1 rounded border outline-none"
            style={{
              background: "var(--mx-input-bg)",
              borderColor: "var(--mx-input-border)",
              color: "var(--mx-text-muted)",
              colorScheme: "dark",
              width: 105,
            }}
            title="Data de entrega"
          />
          <button
            onClick={addTask}
            className="px-2 py-1 text-[10px] font-medium rounded transition-colors"
            style={{
              background: newTitle.trim() ? "rgba(16,185,129,0.15)" : "transparent",
              color: newTitle.trim() ? "#10b981" : "var(--mx-text-muted)",
              border: `1px solid ${newTitle.trim() ? "rgba(16,185,129,0.3)" : "var(--mx-border)"}`,
            }}
          >
            Add
          </button>
        </div>
      </div>
    </NodeWrapper>
  );
}

export default memo(KanbanNode);

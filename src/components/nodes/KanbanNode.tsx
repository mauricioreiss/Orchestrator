import { memo, useState, useCallback } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import type {
  KanbanNodeData,
  KanbanColumn,
  CardPriority,
} from "../../types";
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

const PRIORITY_COLORS: Record<string, string> = {
  green: "#10b981",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
};

const PRIORITY_CYCLE: (CardPriority | undefined)[] = [
  undefined, "green", "yellow", "orange", "red",
];

const COLUMN_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#10b981", "#06b6d4", "#8b5cf6",
];

function KanbanNode({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as KanbanNodeData;
  const label = nodeData.label ?? "Kanban";
  const columns: KanbanColumn[] = nodeData.columns ?? [];

  const hibernatedGroups = useCanvasStore(useShallow((s) => s.hibernatedGroups));
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
  const [newCardText, setNewCardText] = useState<Record<string, string>>({});
  const [colorPickerCol, setColorPickerCol] = useState<string | null>(null);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editColTitle, setEditColTitle] = useState("");

  // --- Core state updater ---

  const updateColumns = useCallback(
    (updater: (cols: KanbanColumn[]) => KanbanColumn[]) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const current = (n.data as KanbanNodeData).columns ?? [];
          return { ...n, data: { ...n.data, columns: updater(current) } };
        }),
      );
      syncDebounced();
    },
    [id, setNodes, syncDebounced],
  );

  // --- DnD handler ---

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, type } = result;
      if (!destination) return;
      if (
        destination.droppableId === source.droppableId &&
        destination.index === source.index
      ) return;

      if (type === "column") {
        updateColumns((cols) => {
          const arr = [...cols];
          const [moved] = arr.splice(source.index, 1);
          arr.splice(destination.index, 0, moved);
          return arr;
        });
        return;
      }

      // Card move (within same column or cross-column)
      updateColumns((cols) => {
        const newCols = cols.map((c) => ({ ...c, cards: [...c.cards] }));
        const srcCol = newCols.find((c) => c.id === source.droppableId);
        const dstCol = newCols.find((c) => c.id === destination.droppableId);
        if (!srcCol || !dstCol) return cols;
        const [card] = srcCol.cards.splice(source.index, 1);
        dstCol.cards.splice(destination.index, 0, card);
        return newCols;
      });
    },
    [updateColumns],
  );

  // --- Card operations ---

  const addCard = useCallback(
    (columnId: string) => {
      const text = (newCardText[columnId] ?? "").trim();
      if (!text) return;
      updateColumns((cols) =>
        cols.map((col) =>
          col.id === columnId
            ? { ...col, cards: [...col.cards, { id: crypto.randomUUID(), title: text }] }
            : col,
        ),
      );
      setNewCardText((prev) => ({ ...prev, [columnId]: "" }));
    },
    [newCardText, updateColumns],
  );

  const removeCard = useCallback(
    (columnId: string, cardId: string) => {
      updateColumns((cols) =>
        cols.map((col) =>
          col.id === columnId
            ? { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
            : col,
        ),
      );
    },
    [updateColumns],
  );

  const cyclePriority = useCallback(
    (columnId: string, cardId: string) => {
      updateColumns((cols) =>
        cols.map((col) => {
          if (col.id !== columnId) return col;
          return {
            ...col,
            cards: col.cards.map((card) => {
              if (card.id !== cardId) return card;
              const idx = PRIORITY_CYCLE.indexOf(card.priority);
              const next = (idx + 1) % PRIORITY_CYCLE.length;
              return { ...card, priority: PRIORITY_CYCLE[next] };
            }),
          };
        }),
      );
    },
    [updateColumns],
  );

  // --- Column operations ---

  const addColumn = useCallback(() => {
    updateColumns((cols) => [
      ...cols,
      { id: crypto.randomUUID(), title: `Column ${cols.length + 1}`, cards: [] },
    ]);
  }, [updateColumns]);

  const removeColumn = useCallback(
    (columnId: string) => {
      updateColumns((cols) => cols.filter((c) => c.id !== columnId));
      setColorPickerCol(null);
    },
    [updateColumns],
  );

  const setColumnColor = useCallback(
    (columnId: string, color: string | undefined) => {
      updateColumns((cols) =>
        cols.map((col) => (col.id === columnId ? { ...col, color } : col)),
      );
      setColorPickerCol(null);
    },
    [updateColumns],
  );

  const renameColumn = useCallback(
    (columnId: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      updateColumns((cols) =>
        cols.map((col) => (col.id === columnId ? { ...col, title: trimmed } : col)),
      );
    },
    [updateColumns],
  );

  const commitColRename = useCallback(() => {
    if (editingColId) {
      renameColumn(editingColId, editColTitle);
      setEditingColId(null);
    }
  }, [editingColId, editColTitle, renameColumn]);

  const totalCards = columns.reduce((sum, col) => sum + col.cards.length, 0);

  // --- Hibernated state ---

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={500}
        minHeight={350}
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

  // --- Active state ---

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={BORDER_COLOR}
      minWidth={500}
      minHeight={350}
      label={label}
      titleBarExtra={
        <button
          onClick={addColumn}
          className="px-1.5 py-0.5 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors nodrag"
          title="Add column"
        >
          + Col
        </button>
      }
      badges={
        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          {totalCards} cards
        </span>
      }
      statusLeft={`${columns.length} columns`}
      statusRight={<span style={{ color: "rgba(16,185,129,0.6)" }}>kanban</span>}
      handles={HANDLES}
    >
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="board" direction="horizontal" type="column">
          {(boardProvided) => (
            <div
              ref={boardProvided.innerRef}
              {...boardProvided.droppableProps}
              className="flex-1 flex gap-2 p-2 min-h-0 overflow-x-auto overflow-y-hidden nodrag nowheel"
            >
              {columns.map((col, colIdx) => (
                <Draggable key={col.id} draggableId={col.id} index={colIdx}>
                  {(colProvided, colSnapshot) => (
                    <div
                      ref={colProvided.innerRef}
                      {...colProvided.draggableProps}
                      className="flex flex-col min-w-[160px] flex-1 rounded-lg"
                      style={{
                        ...colProvided.draggableProps.style,
                        background: "var(--mx-input-bg)",
                        border: `1px solid ${colSnapshot.isDragging ? "#10b981" : "var(--mx-border)"}`,
                      }}
                    >
                      {/* Column header = drag handle */}
                      <div
                        {...colProvided.dragHandleProps}
                        className="flex items-center justify-between px-2 py-1.5 cursor-grab active:cursor-grabbing relative"
                        style={{
                          borderBottom: `2px solid ${col.color || "var(--mx-border)"}`,
                          background: col.color ? `${col.color}15` : "transparent",
                          borderRadius: "8px 8px 0 0",
                        }}
                      >
                        {editingColId === col.id ? (
                          <input
                            autoFocus
                            value={editColTitle}
                            onChange={(e) => setEditColTitle(e.target.value)}
                            onBlur={commitColRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitColRename();
                              if (e.key === "Escape") setEditingColId(null);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="text-xs font-semibold bg-transparent outline-none border-b max-w-[120px] nodrag"
                            style={{ color: col.color || "var(--mx-text)", borderColor: col.color || "var(--mx-border)" }}
                            spellCheck={false}
                          />
                        ) : (
                          <span
                            className="text-xs font-semibold truncate cursor-text"
                            style={{ color: col.color || "var(--mx-text)" }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditColTitle(col.title);
                              setEditingColId(col.id);
                            }}
                            title="Double-click to rename"
                          >
                            {col.title}
                          </span>
                        )}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[9px]" style={{ color: "var(--mx-text-muted)" }}>
                            {col.cards.length}
                          </span>
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setColorPickerCol(colorPickerCol === col.id ? null : col.id);
                            }}
                            className="w-3 h-3 rounded-full border transition-colors"
                            style={{
                              background: col.color || "transparent",
                              borderColor: col.color || "var(--mx-border)",
                            }}
                            title="Column color"
                          />
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeColumn(col.id);
                            }}
                            className="text-[9px] text-red-400 opacity-40 hover:opacity-100 transition-opacity"
                            title="Remove column"
                          >
                            &times;
                          </button>
                        </div>

                        {/* Color picker popover */}
                        {colorPickerCol === col.id && (
                          <div
                            className="absolute top-full left-0 mt-1 flex gap-1 p-1.5 rounded-md z-10"
                            style={{
                              background: "var(--mx-glass-bg)",
                              border: "1px solid var(--mx-border)",
                              backdropFilter: "blur(12px)",
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => setColumnColor(col.id, undefined)}
                              className="w-4 h-4 rounded-full border"
                              style={{ borderColor: "var(--mx-border)", background: "transparent" }}
                              title="None"
                            />
                            {COLUMN_COLORS.map((c) => (
                              <button
                                key={c}
                                onClick={() => setColumnColor(col.id, c)}
                                className="w-4 h-4 rounded-full"
                                style={{ background: c }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card drop zone */}
                      <Droppable droppableId={col.id} type="card">
                        {(cardProvided, cardSnapshot) => (
                          <div
                            ref={cardProvided.innerRef}
                            {...cardProvided.droppableProps}
                            className="flex-1 min-h-[40px] overflow-y-auto p-1.5 space-y-1"
                            style={{
                              background: cardSnapshot.isDraggingOver
                                ? "rgba(16,185,129,0.05)"
                                : "transparent",
                              transition: "background 0.15s",
                            }}
                          >
                            {col.cards.map((card, cardIdx) => (
                              <Draggable key={card.id} draggableId={card.id} index={cardIdx}>
                                {(cardDragProvided, cardDragSnapshot) => (
                                  <div
                                    ref={cardDragProvided.innerRef}
                                    {...cardDragProvided.draggableProps}
                                    {...cardDragProvided.dragHandleProps}
                                    className="rounded px-2 py-1.5 text-[11px] cursor-grab active:cursor-grabbing group"
                                    style={{
                                      ...cardDragProvided.draggableProps.style,
                                      background: "var(--mx-glass-bg)",
                                      border: "1px solid var(--mx-glass-border)",
                                      borderLeft: card.priority
                                        ? `4px solid ${PRIORITY_COLORS[card.priority]}`
                                        : "1px solid var(--mx-glass-border)",
                                      color: "var(--mx-text)",
                                      boxShadow: cardDragSnapshot.isDragging
                                        ? "0 4px 12px rgba(0,0,0,0.3)"
                                        : "none",
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <span className="break-words flex-1">{card.title}</span>
                                      <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            cyclePriority(col.id, card.id);
                                          }}
                                          className="w-3 h-3 rounded-full border transition-colors"
                                          style={{
                                            background: card.priority
                                              ? PRIORITY_COLORS[card.priority]
                                              : "transparent",
                                            borderColor: card.priority
                                              ? PRIORITY_COLORS[card.priority]
                                              : "var(--mx-border)",
                                          }}
                                          title={`Priority: ${card.priority || "none"}`}
                                        />
                                        <button
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeCard(col.id, card.id);
                                          }}
                                          className="text-[9px] text-red-400 transition-opacity"
                                          title="Remove"
                                        >
                                          &times;
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {cardProvided.placeholder}
                          </div>
                        )}
                      </Droppable>

                      {/* Add card input */}
                      <div
                        className="flex gap-1 p-1.5"
                        style={{ borderTop: "1px solid var(--mx-border)" }}
                      >
                        <input
                          type="text"
                          className="flex-1 text-[10px] px-1.5 py-1 rounded border outline-none nodrag"
                          style={{
                            background: "var(--mx-input-bg)",
                            borderColor: "var(--mx-input-border)",
                            color: "var(--mx-text)",
                          }}
                          placeholder="New card..."
                          value={newCardText[col.id] ?? ""}
                          onChange={(e) =>
                            setNewCardText((p) => ({ ...p, [col.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addCard(col.id);
                          }}
                          spellCheck={false}
                        />
                        <button
                          onClick={() => addCard(col.id)}
                          className="px-1.5 text-[10px] text-emerald-400 hover:text-emerald-300 rounded transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {boardProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </NodeWrapper>
  );
}

export default memo(KanbanNode);

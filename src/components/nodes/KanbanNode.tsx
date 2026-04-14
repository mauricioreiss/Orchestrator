import { memo, useState, useCallback } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Reorder, AnimatePresence } from "framer-motion";
import type { KanbanNodeData, KanbanCard, KanbanColumn } from "../../types";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#10b981";
const HANDLES = [{ type: "source" as const, position: Position.Right, color: "#10b981" }];

function KanbanNode({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as KanbanNodeData;
  const label = nodeData.label ?? "Kanban";
  const columns: KanbanColumn[] = nodeData.columns ?? [];

  const hibernatedGroups = useCanvasStore((s) => s.hibernatedGroups);
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
  const [newCardText, setNewCardText] = useState<Record<string, string>>({});

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
          col.id === columnId ? { ...col, cards: col.cards.filter((c) => c.id !== cardId) } : col,
        ),
      );
    },
    [updateColumns],
  );

  const moveCard = useCallback(
    (fromColId: string, toColId: string, cardId: string) => {
      updateColumns((cols) => {
        const fromCol = cols.find((c) => c.id === fromColId);
        const card = fromCol?.cards.find((c) => c.id === cardId);
        if (!card) return cols;
        return cols.map((col) => {
          if (col.id === fromColId) return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
          if (col.id === toColId) return { ...col, cards: [...col.cards, card] };
          return col;
        });
      });
    },
    [updateColumns],
  );

  const reorderCards = useCallback(
    (columnId: string, newOrder: KanbanCard[]) => {
      updateColumns((cols) =>
        cols.map((col) => (col.id === columnId ? { ...col, cards: newOrder } : col)),
      );
    },
    [updateColumns],
  );

  const totalCards = columns.reduce((sum, col) => sum + col.cards.length, 0);

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
          {totalCards} cards
        </span>
      }
      statusLeft={`${columns.length} columns`}
      statusRight={<span style={{ color: "rgba(16,185,129,0.6)" }}>kanban</span>}
      handles={HANDLES}
    >
      <div className="flex-1 flex gap-2 p-2 min-h-0 overflow-x-auto nodrag nowheel">
        {columns.map((col, colIdx) => (
          <div
            key={col.id}
            className="flex flex-col min-w-[140px] flex-1 rounded-lg p-1.5"
            style={{ background: "var(--mx-input-bg)", border: "1px solid var(--mx-border)" }}
          >
            {/* Column header */}
            <div
              className="flex items-center justify-between px-1 pb-1 mb-1"
              style={{ borderBottom: "1px solid var(--mx-border)" }}
            >
              <span className="text-xs font-semibold" style={{ color: "var(--mx-text)" }}>
                {col.title}
              </span>
              <span className="text-[9px]" style={{ color: "var(--mx-text-muted)" }}>
                {col.cards.length}
              </span>
            </div>

            {/* Cards with framer-motion Reorder */}
            <Reorder.Group
              axis="y"
              values={col.cards}
              onReorder={(newOrder) => reorderCards(col.id, newOrder)}
              className="flex-1 min-h-0 overflow-y-auto space-y-1"
              layoutScroll
            >
              <AnimatePresence>
                {col.cards.map((card) => (
                  <Reorder.Item
                    key={card.id}
                    value={card}
                    className="rounded px-2 py-1.5 text-[11px] cursor-grab active:cursor-grabbing"
                    style={{
                      background: "var(--mx-glass-bg)",
                      border: "1px solid var(--mx-glass-border)",
                      color: "var(--mx-text)",
                    }}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    whileDrag={{ scale: 1.03, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="break-words flex-1">{card.title}</span>
                      <div className="flex gap-0.5 shrink-0">
                        {colIdx > 0 && (
                          <button
                            onClick={() => moveCard(col.id, columns[colIdx - 1].id, card.id)}
                            className="text-[9px] opacity-40 hover:opacity-100 transition-opacity"
                            title="Move left"
                          >
                            &larr;
                          </button>
                        )}
                        {colIdx < columns.length - 1 && (
                          <button
                            onClick={() => moveCard(col.id, columns[colIdx + 1].id, card.id)}
                            className="text-[9px] opacity-40 hover:opacity-100 transition-opacity"
                            title="Move right"
                          >
                            &rarr;
                          </button>
                        )}
                        <button
                          onClick={() => removeCard(col.id, card.id)}
                          className="text-[9px] text-red-400 opacity-40 hover:opacity-100 transition-opacity"
                          title="Remove"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>

            {/* Add card */}
            <div className="flex gap-1 mt-1">
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
                onChange={(e) => setNewCardText((p) => ({ ...p, [col.id]: e.target.value }))}
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
        ))}
      </div>
    </NodeWrapper>
  );
}

export default memo(KanbanNode);

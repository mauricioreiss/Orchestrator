import { memo, useState, useCallback } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import type { DbNodeData } from "../../types";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#0ea5e9";
const HANDLES = [{ type: "source" as const, position: Position.Right, color: "#0ea5e9" }];

interface QueryResult {
  columns: string[];
  rows: string[][];
}

const MOCK_DATA: Record<string, QueryResult> = {
  users: {
    columns: ["id", "name", "email", "role", "created_at"],
    rows: [
      ["1", "Alice Santos", "alice@example.com", "admin", "2026-01-15"],
      ["2", "Bob Lima", "bob@example.com", "user", "2026-02-20"],
      ["3", "Carol Souza", "carol@example.com", "editor", "2026-03-10"],
      ["4", "Dave Oliveira", "dave@example.com", "user", "2026-03-22"],
      ["5", "Eve Costa", "eve@example.com", "admin", "2026-04-01"],
    ],
  },
  orders: {
    columns: ["order_id", "user_id", "product", "quantity", "total", "status"],
    rows: [
      ["1001", "1", "Widget Pro", "3", "89.97", "shipped"],
      ["1002", "2", "Gadget X", "1", "49.99", "pending"],
      ["1003", "1", "Cable USB-C", "5", "24.95", "delivered"],
      ["1004", "3", "Monitor 4K", "1", "599.00", "processing"],
      ["1005", "5", "Keyboard MX", "2", "179.98", "shipped"],
    ],
  },
  products: {
    columns: ["id", "name", "category", "price", "stock"],
    rows: [
      ["1", "Widget Pro", "Tools", "29.99", "150"],
      ["2", "Gadget X", "Electronics", "49.99", "75"],
      ["3", "Cable USB-C", "Accessories", "4.99", "500"],
      ["4", "Monitor 4K", "Electronics", "599.00", "20"],
      ["5", "Keyboard MX", "Peripherals", "89.99", "60"],
    ],
  },
};

function detectTable(query: string): string {
  const match = query.toLowerCase().match(/from\s+(\w+)/);
  return match?.[1] ?? "users";
}

function DbNode({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as DbNodeData;
  const label = nodeData.label ?? "Database";

  const hibernatedGroups = useCanvasStore((s) => s.hibernatedGroups);
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const [query, setQuery] = useState(nodeData.query ?? "");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  const persistQuery = useCallback(
    (q: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, query: q } } : n)),
      );
      syncDebounced();
    },
    [id, setNodes, syncDebounced],
  );

  const handleRun = useCallback(() => {
    if (!query.trim() || running) return;
    setError(null);
    setRunning(true);
    const start = performance.now();
    const table = detectTable(query);
    const dataset = MOCK_DATA[table];

    // Simulate query delay
    setTimeout(() => {
      if (!dataset) {
        setError(`Table "${table}" not found. Available: ${Object.keys(MOCK_DATA).join(", ")}`);
        setResult(null);
      } else {
        setResult(dataset);
        setError(null);
      }
      setQueryTime(Math.round(performance.now() - start));
      setRunning(false);
    }, 50 + Math.random() * 100);
  }, [query, running]);

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={450}
        minHeight={300}
        label={label}
        badges={
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-sky-500/20 text-sky-400 border-sky-500/30">
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
      minWidth={450}
      minHeight={300}
      label={label}
      badges={
        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-sky-500/20 text-sky-400 border-sky-500/30">
          mock
        </span>
      }
      statusLeft={result ? `${result.rows.length} rows` : "no results"}
      statusRight={
        <span style={{ color: "rgba(14,165,233,0.6)" }}>
          {queryTime !== null && <span className="mr-2">{queryTime}ms</span>}
          data
        </span>
      }
      handles={HANDLES}
    >
      <div className="flex-1 flex flex-col min-h-0 p-2 gap-2 nodrag nowheel">
        {/* Query input */}
        <div className="flex gap-1.5">
          <textarea
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              persistQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleRun();
            }}
            placeholder="SELECT * FROM users LIMIT 10;"
            className="flex-1 text-[11px] font-mono px-2 py-1.5 rounded border outline-none resize-none"
            style={{
              background: "var(--mx-input-bg)",
              borderColor: "var(--mx-input-border)",
              color: "var(--mx-text)",
            }}
            rows={2}
            spellCheck={false}
          />
          <button
            onClick={handleRun}
            disabled={!query.trim() || running}
            className="px-3 py-1.5 text-white text-xs font-medium rounded transition-colors self-end disabled:opacity-40"
            style={{ background: running ? "#6b7280" : "#0ea5e9" }}
          >
            {running ? "..." : "Run"}
          </button>
        </div>

        {/* Tables hint */}
        <div className="text-[9px]" style={{ color: "var(--mx-text-muted)" }}>
          Tables: {Object.keys(MOCK_DATA).join(", ")} | Ctrl+Enter to run
        </div>

        {/* Error */}
        {error && <p className="text-[11px] text-red-400">{error}</p>}

        {/* Results table */}
        {result && (
          <div
            className="flex-1 min-h-0 rounded border overflow-auto"
            style={{ borderColor: "var(--mx-border)" }}
          >
            <table
              className="w-full text-[10px] font-mono border-collapse"
              style={{ minWidth: result.columns.length * 100 }}
            >
              <thead>
                <tr>
                  {result.columns.map((col) => (
                    <th
                      key={col}
                      className="sticky top-0 text-left px-2 py-1.5 font-semibold whitespace-nowrap"
                      style={{
                        background: "var(--mx-titlebar)",
                        borderBottom: "1px solid var(--mx-border)",
                        color: "#0ea5e9",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    style={{
                      background: rowIdx % 2 === 0 ? "transparent" : "var(--mx-input-bg)",
                    }}
                  >
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        className="px-2 py-1 whitespace-nowrap"
                        style={{
                          color: "var(--mx-text)",
                          borderBottom: "1px solid var(--mx-border)",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {!result && !error && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs" style={{ color: "var(--mx-text-muted)" }}>
              Run a query to see results
            </span>
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

export default memo(DbNode);

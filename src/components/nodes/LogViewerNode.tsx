import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { toast } from "sonner";
import { invoke, listen, isElectron } from "../../lib/electron";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import NodeWrapper from "./NodeWrapper";
import type { LogViewerNodeData } from "../../types";

const BORDER_COLOR = "#22c55e";

const HANDLES = [
  { id: "top", type: "target" as const, position: Position.Top },
  { id: "bottom", type: "source" as const, position: Position.Bottom },
  { id: "left", type: "target" as const, position: Position.Left },
  { id: "right", type: "source" as const, position: Position.Right },
];

const MAX_LINES = 10_000;

function LogViewerNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as LogViewerNodeData;
  const label = nodeData.label ?? "Log Viewer";

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [pathInput, setPathInput] = useState(nodeData.filePath ?? "");

  // Buffer collects data while paused so we can flush on resume
  const pausedBufferRef = useRef<string[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const watchIdRef = useRef<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Auto-scroll to bottom when new lines arrive (only if not paused)
  useEffect(() => {
    if (paused) return;
    const el = logContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines, paused]);

  // Append new text, respecting MAX_LINES cap
  const appendText = useCallback((text: string) => {
    setLines((prev) => {
      const incoming = text.split("\n");
      const merged = [...prev, ...incoming];
      if (merged.length > MAX_LINES) {
        return merged.slice(merged.length - MAX_LINES);
      }
      return merged;
    });
  }, []);

  // Stop current watcher (cleanup)
  const stopWatcher = useCallback(async () => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    if (watchIdRef.current) {
      const wid = watchIdRef.current;
      watchIdRef.current = null;
      try {
        await invoke("tail_stop", { watchId: wid });
      } catch (err) {
        console.error("[LogViewerNode] tail_stop failed:", err);
      }
    }
  }, []);

  // Start tailing a file
  const startWatcher = useCallback(
    async (filePath: string) => {
      await stopWatcher();
      setLines([]);
      pausedBufferRef.current = [];

      if (!isElectron() || !filePath) return;

      try {
        const result = await invoke<{ watchId: string; content: string }>(
          "tail_start",
          { filePath },
        );

        watchIdRef.current = result.watchId;

        // Load initial content
        if (result.content) {
          appendText(result.content);
        }

        // Listen for new chunks
        const unlisten = listen<{ chunk: string }>(
          `file-tail-${result.watchId}`,
          ({ chunk }) => {
            if (pausedRef.current) {
              // Buffer while paused
              pausedBufferRef.current.push(chunk);
            } else {
              appendText(chunk);
            }
          },
        );

        unlistenRef.current = unlisten;
      } catch (err) {
        console.error("[LogViewerNode] tail_start failed:", err);
        toast.error(`Falha ao abrir log: ${String(err)}`);
      }
    },
    [stopWatcher, appendText],
  );

  // Start/restart watcher when filePath in node data changes
  useEffect(() => {
    if (nodeData.filePath) {
      setPathInput(nodeData.filePath);
      startWatcher(nodeData.filePath);
    }
    return () => {
      stopWatcher();
    };
  }, [nodeData.filePath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist filePath to node data and kick off tailing
  const commitPath = useCallback(
    (filePath: string) => {
      const trimmed = filePath.trim();
      if (!trimmed) return;

      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, filePath: trimmed } } : n,
        ),
      );
      syncDebounced();
    },
    [id, setNodes, syncDebounced],
  );

  const handleBrowse = useCallback(async () => {
    if (!isElectron()) return;

    const selected = await window.maestriAPI.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Log files", extensions: ["log", "txt", "out", "err"] },
        { name: "All", extensions: ["*"] },
      ],
    });

    if (selected) {
      setPathInput(selected);
      commitPath(selected);
    }
  }, [commitPath]);

  const handlePathKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commitPath(pathInput);
      }
    },
    [pathInput, commitPath],
  );

  const handleClear = useCallback(() => {
    setLines([]);
    pausedBufferRef.current = [];
  }, []);

  const handleTogglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (!next && pausedBufferRef.current.length > 0) {
        // Flush buffered chunks on resume
        const buffered = pausedBufferRef.current.join("");
        pausedBufferRef.current = [];
        appendText(buffered);
      }
      return next;
    });
  }, [appendText]);

  const lineCount = lines.length;
  const displayPath = nodeData.filePath
    ? nodeData.filePath.replace(/\\/g, "/").split("/").pop() ?? nodeData.filePath
    : "no file";

  // Title bar extra: Clear + Pause/Resume
  const titleBarExtra = (
    <>
      <button
        onClick={handleClear}
        className="px-1.5 py-0.5 text-[10px] rounded transition-colors nodrag"
        style={{ color: "var(--mx-text-muted)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(34,197,94,0.1)";
          e.currentTarget.style.color = "#22c55e";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--mx-text-muted)";
        }}
        title="Limpar buffer"
      >
        Clear
      </button>
      <button
        onClick={handleTogglePause}
        className="px-1.5 py-0.5 text-[10px] rounded transition-colors nodrag"
        style={{
          color: paused ? "#f59e0b" : "var(--mx-text-muted)",
          background: paused ? "rgba(245,158,11,0.1)" : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!paused) {
            e.currentTarget.style.background = "rgba(34,197,94,0.1)";
            e.currentTarget.style.color = "#22c55e";
          }
        }}
        onMouseLeave={(e) => {
          if (!paused) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--mx-text-muted)";
          }
        }}
        title={paused ? "Continuar tailing" : "Pausar tailing"}
      >
        {paused ? "Resume" : "Pause"}
      </button>
    </>
  );

  // Status badge
  const statusBadge = (
    <span
      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
        paused
          ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
          : nodeData.filePath
            ? "bg-green-500/20 text-green-400 border-green-500/30"
            : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
      }`}
    >
      {paused ? "paused" : nodeData.filePath ? "tailing" : "idle"}
    </span>
  );

  // Web-only placeholder
  if (!isElectron()) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={400}
        minHeight={300}
        label={label}
        badges={statusBadge}
        statusLeft="web preview"
        handles={HANDLES}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: "var(--mx-text-muted)" }}
          >
            <path
              d="M14 3v4a1 1 0 001 1h4M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9 13h6M9 17h3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <p
            className="text-sm text-center"
            style={{ color: "var(--mx-text-secondary)" }}
          >
            Ambiente Web detectado
          </p>
          <p
            className="text-[11px] text-center leading-relaxed max-w-[260px]"
            style={{ color: "var(--mx-text-muted)" }}
          >
            Use a versao Desktop do Orchestrated Space para tail de logs.
          </p>
        </div>
      </NodeWrapper>
    );
  }

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={BORDER_COLOR}
      minWidth={400}
      minHeight={300}
      label={label}
      titleBarExtra={titleBarExtra}
      badges={statusBadge}
      statusLeft={`${lineCount} lines`}
      statusRight={
        <span className="font-mono truncate max-w-[200px]" title={nodeData.filePath}>
          {displayPath}
        </span>
      }
      handles={HANDLES}
    >
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Path input bar */}
        <div
          className="flex items-center gap-1 px-2 py-1 nodrag"
          style={{
            background: "var(--mx-surface)",
            borderBottom: "1px solid var(--mx-border)",
          }}
        >
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={handlePathKeyDown}
            onBlur={() => {
              if (pathInput.trim() && pathInput.trim() !== nodeData.filePath) {
                commitPath(pathInput);
              }
            }}
            placeholder="Caminho do arquivo de log..."
            className="flex-1 bg-transparent text-xs font-mono outline-none min-w-0"
            style={{ color: "var(--mx-text)" }}
            spellCheck={false}
          />
          <button
            onClick={handleBrowse}
            className="px-2 py-0.5 text-[10px] font-medium rounded transition-colors shrink-0"
            style={{
              background: "rgba(34,197,94,0.1)",
              color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.2)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(34,197,94,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(34,197,94,0.1)";
            }}
          >
            Browse
          </button>
        </div>

        {/* Log content area */}
        <div
          ref={logContainerRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden nodrag nowheel p-2"
          style={{
            background: "#0a0a0a",
            color: "#22c55e",
            boxShadow: "inset 0 0 30px rgba(34, 197, 94, 0.03)",
          }}
        >
          {lines.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span
                className="text-[11px] font-mono"
                style={{ color: "rgba(34, 197, 94, 0.3)" }}
              >
                {nodeData.filePath
                  ? "Aguardando dados..."
                  : "Selecione um arquivo para iniciar"}
              </span>
            </div>
          ) : (
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all m-0">
              {lines.join("\n")}
            </pre>
          )}
        </div>
      </div>
    </NodeWrapper>
  );
}

const LogViewerNode = memo(LogViewerNodeInner);
export default LogViewerNode;

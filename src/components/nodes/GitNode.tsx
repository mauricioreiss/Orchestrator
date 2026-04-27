import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { toast } from "sonner";
import { invoke, isElectron } from "../../lib/electron";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import { useShallow } from "zustand/react/shallow";
import NodeWrapper from "./NodeWrapper";
import type { GitNodeData } from "../../types";

const BORDER_COLOR = "#f43f5e";
const HANDLES = [
  { id: "top", type: "target" as const, position: Position.Top, color: "#f43f5e" },
  { id: "bottom", type: "source" as const, position: Position.Bottom, color: "#f43f5e" },
  { id: "left", type: "target" as const, position: Position.Left, color: "#f43f5e" },
  { id: "right", type: "source" as const, position: Position.Right, color: "#f43f5e" },
];

interface GitFileEntry {
  code: string;
  file: string;
}

/** Parse `git status --short` output into structured entries. */
function parseStatusOutput(raw: string): GitFileEntry[] {
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => ({
      code: line.substring(0, 2),
      file: line.substring(3),
    }));
}

/** Status code to color mapping. */
function statusColor(code: string): string {
  const trimmed = code.trim();
  if (trimmed.startsWith("M") || trimmed.endsWith("M")) return "#f59e0b"; // amber — modified
  if (trimmed.startsWith("A") || trimmed.endsWith("A")) return "#22c55e"; // green — added
  if (trimmed.startsWith("D") || trimmed.endsWith("D")) return "#ef4444"; // red — deleted
  if (trimmed === "??") return "#71717a"; // zinc — untracked
  if (trimmed.startsWith("R") || trimmed.endsWith("R")) return "#06b6d4"; // cyan — renamed
  if (trimmed.startsWith("C") || trimmed.endsWith("C")) return "#8b5cf6"; // purple — copied
  return "var(--mx-text-secondary)";
}

function GitNodeInner({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as GitNodeData;
  const label = nodeData.label ?? "Git";
  const cwd = nodeData.cwd ?? "";

  const hibernatedGroups = useCanvasStore(useShallow((s) => s.hibernatedGroups));
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  const [files, setFiles] = useState<GitFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [revertArmed, setRevertArmed] = useState(false);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist cwd changes to node data
  const persistCwd = useCallback(
    (newCwd: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, cwd: newCwd } } : n,
        ),
      );
      syncDebounced();
    },
    [id, setNodes, syncDebounced],
  );

  const handleSelectFolder = useCallback(async () => {
    if (!isElectron()) return;
    const selected = await window.maestriAPI.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (selected) {
      persistCwd(selected);
    }
  }, [persistCwd]);

  const fetchStatus = useCallback(async () => {
    if (!cwd || !isElectron()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<string>("git_status", { cwd });
      setFiles(parseStatusOutput(result));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  // Auto-refresh on mount and when cwd changes
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleCommit = useCallback(async () => {
    if (!cwd || !isElectron() || committing) return;
    setCommitting(true);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const message = `AI Update - ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    try {
      await invoke<string>("git_commit", { cwd, message });
      toast.success("Commit realizado com sucesso.");
      fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Commit falhou: ${msg}`);
    } finally {
      setCommitting(false);
    }
  }, [cwd, committing, fetchStatus]);

  const handleRevert = useCallback(async () => {
    if (!cwd || !isElectron()) return;

    if (!revertArmed) {
      // Arm the button — user must click again within 3s
      setRevertArmed(true);
      revertTimerRef.current = setTimeout(() => setRevertArmed(false), 3000);
      return;
    }

    // Confirmed — execute reset
    setRevertArmed(false);
    if (revertTimerRef.current) {
      clearTimeout(revertTimerRef.current);
      revertTimerRef.current = null;
    }

    try {
      await invoke<string>("git_reset_hard", { cwd });
      toast.success("Reset concluido. Todas as alteracoes foram descartadas.");
      fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Reset falhou: ${msg}`);
    }
  }, [cwd, revertArmed, fetchStatus]);

  // Cleanup revert timer on unmount
  useEffect(() => {
    return () => {
      if (revertTimerRef.current) clearTimeout(revertTimerRef.current);
    };
  }, []);

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={340}
        minHeight={260}
        label={label}
        badges={
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-rose-500/20 text-rose-400 border-rose-500/30">
            sleep
          </span>
        }
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm" style={{ color: "var(--mx-text-muted)" }}>
            Hibernated
          </span>
        </div>
      </NodeWrapper>
    );
  }

  if (!isElectron()) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={340}
        minHeight={260}
        label={label}
        badges={
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-rose-500/20 text-rose-400 border-rose-500/30">
            web
          </span>
        }
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center p-4">
          <p
            className="text-sm text-center"
            style={{ color: "var(--mx-text-secondary)" }}
          >
            Use a versao Desktop para o Git Node.
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
      minWidth={340}
      minHeight={260}
      label={label}
      badges={
        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-rose-500/20 text-rose-400 border-rose-500/30">
          {files.length} arquivo{files.length !== 1 ? "s" : ""}
        </span>
      }
      statusLeft={cwd ? cwd.split(/[\\/]/).pop() : "sem projeto"}
      statusRight={
        <span style={{ color: "rgba(244,63,94,0.6)" }}>git</span>
      }
      handles={HANDLES}
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* Path display + folder selector */}
        <div
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 nodrag"
          style={{
            borderBottom: "1px solid var(--mx-border)",
            background: "var(--mx-surface)",
          }}
        >
          {cwd ? (
            <>
              <span
                className="flex-1 text-[10px] font-mono truncate"
                style={{ color: "var(--mx-text-secondary)" }}
                title={cwd}
              >
                {cwd}
              </span>
              <button
                onClick={fetchStatus}
                disabled={loading}
                className="px-2 py-0.5 text-[10px] font-semibold rounded transition-colors"
                style={{
                  background: "rgba(244,63,94,0.1)",
                  color: "#fb7185",
                  border: "1px solid rgba(244,63,94,0.2)",
                  cursor: loading ? "wait" : "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(244,63,94,0.2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "rgba(244,63,94,0.1)")
                }
              >
                {loading ? "..." : "Refresh"}
              </button>
            </>
          ) : (
            <>
              <span
                className="flex-1 text-[10px]"
                style={{ color: "var(--mx-text-muted)" }}
              >
                No project path
              </span>
              <button
                onClick={handleSelectFolder}
                className="px-2 py-0.5 text-[10px] font-semibold rounded transition-colors"
                style={{
                  background: "rgba(244,63,94,0.15)",
                  color: "#fb7185",
                  border: "1px solid rgba(244,63,94,0.25)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(244,63,94,0.25)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "rgba(244,63,94,0.15)")
                }
              >
                Select Folder
              </button>
            </>
          )}
        </div>

        {/* File list */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-3 py-1.5 nodrag nowheel"
          style={{ background: "var(--mx-surface)" }}
        >
          {error && (
            <div
              className="px-2 py-1.5 rounded text-[11px] mb-1"
              style={{
                background: "rgba(239,68,68,0.1)",
                color: "#f87171",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              {error}
            </div>
          )}

          {!error && files.length === 0 && !loading && cwd && (
            <div className="flex items-center justify-center h-full">
              <span
                className="text-[11px]"
                style={{ color: "var(--mx-text-muted)" }}
              >
                Working tree clean
              </span>
            </div>
          )}

          {!error && files.length === 0 && !cwd && (
            <div className="flex items-center justify-center h-full">
              <span
                className="text-[11px]"
                style={{ color: "var(--mx-text-muted)" }}
              >
                Selecione uma pasta para iniciar
              </span>
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-px">
              {files.map((entry, i) => (
                <div
                  key={`${entry.file}-${i}`}
                  className="flex items-center gap-2 px-1 py-0.5 rounded text-xs font-mono"
                  style={{ color: "var(--mx-text)" }}
                >
                  <span
                    className="w-5 text-center text-[10px] font-bold shrink-0"
                    style={{ color: statusColor(entry.code) }}
                  >
                    {entry.code.trim()}
                  </span>
                  <span
                    className="truncate text-[11px]"
                    style={{ color: "var(--mx-text-secondary)" }}
                    title={entry.file}
                  >
                    {entry.file}
                  </span>
                </div>
              ))}
            </div>
          )}

          {loading && files.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <span
                className="text-[11px]"
                style={{ color: "var(--mx-text-muted)" }}
              >
                Carregando...
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {cwd && (
          <div
            className="shrink-0 flex items-center gap-2 px-3 py-1.5 nodrag"
            style={{ borderTop: "1px solid var(--mx-border)" }}
          >
            <button
              onClick={handleCommit}
              disabled={committing || files.length === 0}
              className="flex-1 px-2 py-1 text-[10px] font-semibold rounded transition-colors"
              style={{
                background:
                  files.length > 0 && !committing
                    ? "rgba(34,197,94,0.15)"
                    : "var(--mx-surface-alt)",
                color:
                  files.length > 0 && !committing
                    ? "#22c55e"
                    : "var(--mx-text-muted)",
                border: `1px solid ${
                  files.length > 0 && !committing
                    ? "rgba(34,197,94,0.3)"
                    : "var(--mx-border)"
                }`,
                cursor:
                  files.length > 0 && !committing ? "pointer" : "not-allowed",
              }}
              onMouseEnter={(e) => {
                if (files.length > 0 && !committing)
                  e.currentTarget.style.background = "rgba(34,197,94,0.25)";
              }}
              onMouseLeave={(e) => {
                if (files.length > 0 && !committing)
                  e.currentTarget.style.background = "rgba(34,197,94,0.15)";
              }}
            >
              {committing ? "Commitando..." : "Commit"}
            </button>

            <button
              onClick={handleRevert}
              disabled={files.length === 0 && !revertArmed}
              className="flex-1 px-2 py-1 text-[10px] font-semibold rounded transition-colors"
              style={{
                background: revertArmed
                  ? "rgba(239,68,68,0.3)"
                  : files.length > 0
                    ? "rgba(239,68,68,0.1)"
                    : "var(--mx-surface-alt)",
                color: revertArmed
                  ? "#fca5a5"
                  : files.length > 0
                    ? "#f87171"
                    : "var(--mx-text-muted)",
                border: `1px solid ${
                  revertArmed
                    ? "rgba(239,68,68,0.5)"
                    : files.length > 0
                      ? "rgba(239,68,68,0.2)"
                      : "var(--mx-border)"
                }`,
                cursor:
                  files.length > 0 || revertArmed ? "pointer" : "not-allowed",
              }}
              onMouseEnter={(e) => {
                if (files.length > 0 || revertArmed)
                  e.currentTarget.style.background = revertArmed
                    ? "rgba(239,68,68,0.4)"
                    : "rgba(239,68,68,0.2)";
              }}
              onMouseLeave={(e) => {
                if (files.length > 0 || revertArmed)
                  e.currentTarget.style.background = revertArmed
                    ? "rgba(239,68,68,0.3)"
                    : "rgba(239,68,68,0.1)";
              }}
            >
              {revertArmed ? "CONFIRM RESET?" : "Revert All"}
            </button>
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

const GitNode = memo(GitNodeInner);
export default GitNode;

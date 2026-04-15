import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { openDialog } from "../../lib/electron";
import type { VSCodeNodeData } from "../../types";
import { isElectron } from "../../lib/electron";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCodeServer } from "../../hooks/useCodeServer";
import { useCanvasStore } from "../../store/canvasStore";
import { useShallow } from "zustand/react/shallow";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#06b6d4";
const HANDLES = [{ type: "source" as const, position: Position.Right, color: "#06b6d4" }];

function VSCodeNode({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as VSCodeNodeData;
  const label = nodeData.label ?? "VS Code";

  const hibernatedGroups = useCanvasStore(useShallow((s) => s.hibernatedGroups));
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const [path, setPath] = useState(nodeData.workspacePath ?? "");
  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
  const pathSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const { detection, status, starting, error, start, stop } = useCodeServer({
    instanceId: id,
    disabled: isHibernated,
  });

  const syncPath = useCallback(
    (newPath: string) => {
      if (pathSyncRef.current) clearTimeout(pathSyncRef.current);
      pathSyncRef.current = setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, workspacePath: newPath } } : n,
          ),
        );
        syncDebounced();
      }, 300);
    },
    [id, setNodes, syncDebounced],
  );

  useEffect(() => {
    return () => {
      if (pathSyncRef.current) clearTimeout(pathSyncRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  const isLive = status?.running && status?.ready && !starting;
  useEffect(() => {
    if (isLive) {
      retryRef.current = setTimeout(() => setIframeKey((k) => k + 1), 500);
    }
  }, [isLive]);

  const handleBrowse = useCallback(async () => {
    const selected = await openDialog({ directory: true, multiple: false, title: "Select workspace folder" });
    if (selected) {
      setPath(selected);
      syncPath(selected);
      start(selected);
    }
  }, [start, syncPath]);

  const handleStartEmpty = useCallback(() => { start(""); }, [start]);
  const handleStop = useCallback(() => { stop(); }, [stop]);
  const handleReconnect = useCallback(() => { setIframeKey((k) => k + 1); }, []);

  const buildIframeUrl = useCallback(() => {
    if (!status) return "";
    const baseUrl = `http://127.0.0.1:${status.port}`;
    let ws = (path || status.workspace || "").replace(/\\/g, "/");
    // VS Code VFS requires leading slash on Windows (e.g. /C:/Users/...)
    if (ws && !ws.startsWith("/")) {
      ws = "/" + ws;
    }
    const locale = "locale=en&hl=en";
    return ws ? `${baseUrl}/?folder=${encodeURIComponent(ws)}&${locale}` : `${baseUrl}/?${locale}`;
  }, [status, path]);

  const handleIframeError = useCallback(() => {
    retryRef.current = setTimeout(() => setIframeKey((k) => k + 1), 2000);
  }, []);

  // Web-only placeholder
  if (!isElectron()) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={320}
        minHeight={120}
        label={label}
        badges={<span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-cyan-500/20 text-cyan-400 border-cyan-500/30">web</span>}
        statusLeft="web preview"
        handles={HANDLES}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: "var(--mx-text-muted)" }}>
            <path d="M17.5 0l-10 10 10 10-1.5 1.5L4 10 16 -1.5z" fill="currentColor" transform="translate(2,2) scale(0.83)" />
          </svg>
          <p className="text-sm text-center" style={{ color: "var(--mx-text-secondary)" }}>Ambiente Web detectado</p>
          <p className="text-[11px] text-center leading-relaxed max-w-[280px]" style={{ color: "var(--mx-text-muted)" }}>
            Use a versao Desktop do Maestri-X para embeds do VS Code.
          </p>
        </div>
      </NodeWrapper>
    );
  }

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={320}
        minHeight={120}
        label={label}
        badges={<span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-cyan-500/20 text-cyan-400 border-cyan-500/30">cwd</span>}
        statusLeft={path || "no path set"}
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--mx-text-muted)" }}>
              <path d="M21 15.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10.5M12 8v4M8 21h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-sm" style={{ color: "var(--mx-text-muted)" }}>Hibernated</span>
          </div>
        </div>
      </NodeWrapper>
    );
  }

  const isStarting = starting || (status?.running && !status?.ready);

  const statusBadge = (
    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
      isLive
        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
        : isStarting
          ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
          : "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
    }`}>
      {isLive ? "live" : isStarting ? "loading" : "cwd"}
    </span>
  );

  const extraButtons = (
    <>
      {isLive && (
        <button onClick={handleReconnect} className="px-1.5 py-0.5 text-[10px] text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded transition-colors nodrag" title="Refresh iframe">
          Reconectar
        </button>
      )}
      {(isLive || isStarting) && (
        <button onClick={handleStop} className="px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors nodrag" title="Stop server">
          Stop
        </button>
      )}
    </>
  );

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={BORDER_COLOR}
      minWidth={isLive ? 500 : 350}
      minHeight={isLive ? 400 : 200}
      label={label}
      titleBarExtra={extraButtons}
      badges={statusBadge}
      statusLeft={
        <span className="truncate max-w-[300px]" title={path || status?.workspace || ""}>
          {isLive
            ? `127.0.0.1:${status!.port} | ${path || status!.workspace || "no folder"}`
            : path || "no folder selected"}
        </span>
      }
      statusRight={
        <span style={{ color: "rgba(6,182,212,0.6)" }}>
          {isLive
            ? `port ${status!.port}`
            : detection?.source ? `via ${detection.source}` : "vscode"}
        </span>
      }
      handles={HANDLES}
    >
      {isLive ? (
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={buildIframeUrl()}
          className="flex-1 min-h-0 w-full border-0 nodrag nowheel"
          title={`VS Code: ${path}`}
          onError={handleIframeError}
        />
      ) : isStarting ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
          <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-cyan-400">
            {status?.running ? "Connecting to VS Code..." : "Starting VS Code server..."}
          </span>
          <span className="text-[10px]" style={{ color: "var(--mx-text-muted)" }}>
            {path || status?.workspace || "no folder"}
          </span>
          <span className="text-[10px] italic" style={{ color: "var(--mx-text-muted)" }}>
            Primeira execucao pode demorar (download do servidor)
          </span>
          <button onClick={handleStop} className="text-[11px] hover:text-red-400 transition-colors nodrag" style={{ color: "var(--mx-text-muted)" }}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          {detection && !detection.found && (
            <p className="text-[11px] text-red-400 text-center">
              VS Code not found. Install from{" "}
              <a href="https://code.visualstudio.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-300">
                code.visualstudio.com
              </a>
            </p>
          )}
          {error && (
            <div className="flex flex-col items-center gap-2 max-w-full">
              <p className="text-[11px] text-red-400 text-center break-words" title={error}>
                {error.length > 200 ? error.slice(0, 200) + "..." : error}
              </p>
              <button
                onClick={async () => { await stop().catch(() => {}); start(path || ""); }}
                className="px-3 py-1 text-[11px] text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:border-cyan-500/50 rounded transition-colors nodrag"
              >
                Recarregar Editor
              </button>
            </div>
          )}
          <button
            onClick={handleBrowse}
            disabled={!detection?.found}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-[#313244] disabled:text-[#6c7086] text-white text-sm font-medium rounded-lg transition-colors nodrag"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4.5A1.5 1.5 0 013.5 3h3.379a1.5 1.5 0 011.06.44l.622.62a1.5 1.5 0 001.06.44H12.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Open Folder
          </button>
          <button onClick={handleStartEmpty} disabled={!detection?.found} className="text-[11px] hover:text-cyan-400 transition-colors nodrag" style={{ color: "var(--mx-text-muted)" }}>
            or start without folder
          </button>
          {path && (
            <span className="text-[10px] truncate max-w-full" style={{ color: "var(--mx-text-muted)" }}>
              Last: {path}
            </span>
          )}
        </div>
      )}
    </NodeWrapper>
  );
}

export default memo(VSCodeNode);

import { memo, useState, useCallback, useRef, useEffect } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import { open } from "@tauri-apps/plugin-dialog";
import type { VSCodeNodeData } from "../../types";
import { isTauri } from "../../lib/tauri";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCodeServer } from "../../hooks/useCodeServer";
import { useCanvasStore } from "../../store/canvasStore";

const BORDER_COLOR = "#06b6d4";

function VSCodeNode({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as VSCodeNodeData;
  const label = nodeData.label ?? "VS Code";

  const hibernatedGroups = useCanvasStore((s) => s.hibernatedGroups);
  const isHibernated = parentId
    ? hibernatedGroups.includes(parentId as string)
    : false;

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

  // Sync path to node data (debounced)
  const syncPath = useCallback(
    (newPath: string) => {
      if (pathSyncRef.current) clearTimeout(pathSyncRef.current);
      pathSyncRef.current = setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, workspacePath: newPath } }
              : n,
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

  // Auto-retry iframe when server becomes ready
  const isLive = status?.running && status?.ready && !starting;
  useEffect(() => {
    if (isLive) {
      // Give the server a moment to fully initialize, then reload iframe
      retryRef.current = setTimeout(() => setIframeKey((k) => k + 1), 500);
    }
  }, [isLive]);

  // Native folder picker
  const handleBrowse = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select workspace folder",
    });
    if (selected) {
      const folder = selected as string;
      setPath(folder);
      syncPath(folder);
      start(folder);
    }
  }, [start, syncPath]);

  // Start without folder
  const handleStartEmpty = useCallback(() => {
    start("");
  }, [start]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  // Refresh iframe without restarting the server
  const handleReconnect = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  // Build iframe URL with folder parameter (no token needed — using --without-connection-token)
  const buildIframeUrl = useCallback(() => {
    if (!status) return "";
    const ws = path || status.workspace;
    if (ws) {
      return `${status.url}/?folder=${encodeURIComponent(ws)}`;
    }
    return `${status.url}/`;
  }, [status, path]);

  // Iframe error handler — retry after delay
  const handleIframeError = useCallback(() => {
    retryRef.current = setTimeout(() => {
      setIframeKey((k) => k + 1);
    }, 2000);
  }, []);

  // Web-only placeholder
  if (!isTauri()) {
    return (
      <>
        <NodeResizer
          isVisible={selected}
          minWidth={320}
          minHeight={120}
          lineStyle={{ borderColor: BORDER_COLOR }}
          handleStyle={{ width: 10, height: 10, backgroundColor: BORDER_COLOR, borderColor: BORDER_COLOR }}
        />
        <div
          className="flex flex-col h-full rounded-lg overflow-hidden shadow-2xl"
          style={{
            border: `1px solid ${selected ? BORDER_COLOR : "rgba(49,50,68,0.5)"}`,
            background: "rgba(24,24,37,0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b]/80 border-b border-[#313244]/50 select-none cursor-grab active:cursor-grabbing">
            <span className="text-sm font-medium text-[#cdd6f4] truncate max-w-[200px]">{label}</span>
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-cyan-500/20 text-cyan-400 border-cyan-500/30">web</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[#6c7086]">
              <path d="M17.5 0l-10 10 10 10-1.5 1.5L4 10 16 -1.5z" fill="currentColor" transform="translate(2,2) scale(0.83)" />
            </svg>
            <p className="text-sm text-[#a6adc8] text-center">Ambiente Web detectado</p>
            <p className="text-[11px] text-[#6c7086] text-center leading-relaxed max-w-[280px]">
              Use a versao Desktop do Maestri-X para embeds do VS Code com file explorer e editor completo.
            </p>
          </div>
          <div className="flex items-center px-3 py-1 bg-[#11111b]/80 border-t border-[#313244]/50 select-none">
            <span className="text-[10px] text-[#6c7086]">web preview</span>
          </div>
        </div>
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-[#181825]" />
      </>
    );
  }

  if (isHibernated) {
    return (
      <>
        <NodeResizer
          isVisible={selected}
          minWidth={320}
          minHeight={120}
          lineStyle={{ borderColor: BORDER_COLOR }}
          handleStyle={{
            width: 10,
            height: 10,
            backgroundColor: BORDER_COLOR,
            borderColor: BORDER_COLOR,
          }}
        />
        <div
          className="flex flex-col h-full rounded-lg overflow-hidden shadow-2xl"
          style={{
            border: `1px solid ${selected ? BORDER_COLOR : "rgba(49,50,68,0.5)"}`,
            background: "rgba(24,24,37,0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b]/80 border-b border-[#313244]/50 select-none cursor-grab active:cursor-grabbing">
            <span className="text-sm font-medium text-[#6c7086] truncate max-w-[200px]">
              {label}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
              cwd
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#6c7086]">
                <path d="M21 15.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10.5M12 8v4M8 21h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-[#6c7086] text-sm">Hibernated</span>
            </div>
          </div>
          <div className="flex items-center px-3 py-1 bg-[#11111b]/80 border-t border-[#313244]/50 select-none">
            <span className="text-[10px] text-[#6c7086] truncate">{path || "no path set"}</span>
          </div>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-[#181825]"
        />
      </>
    );
  }

  // Determine display state
  const isStarting = starting || (status?.running && !status?.ready);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={isLive ? 500 : 350}
        minHeight={isLive ? 400 : 200}
        lineStyle={{ borderColor: BORDER_COLOR }}
        handleStyle={{
          width: 10,
          height: 10,
          backgroundColor: BORDER_COLOR,
          borderColor: BORDER_COLOR,
        }}
      />

      <div
        className="flex flex-col h-full rounded-lg overflow-hidden shadow-2xl"
        style={{
          border: `1px solid ${selected ? BORDER_COLOR : "rgba(49,50,68,0.5)"}`,
          background: "rgba(24,24,37,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: selected
            ? `0 0 20px ${BORDER_COLOR}33, 0 8px 32px rgba(0,0,0,0.3)`
            : "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b]/80 border-b border-[#313244]/50 select-none cursor-grab active:cursor-grabbing">
          <span className="text-sm font-medium text-[#cdd6f4] truncate max-w-[200px]">
            {label}
          </span>
          <div className="flex items-center gap-2">
            {isLive && (
              <button
                onClick={handleReconnect}
                className="px-1.5 py-0.5 text-[10px] text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded transition-colors nodrag"
                title="Refresh iframe"
              >
                Reconectar
              </button>
            )}
            {(isLive || isStarting) && (
              <button
                onClick={handleStop}
                className="px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors nodrag"
                title="Stop server"
              >
                Stop
              </button>
            )}
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                isLive
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : isStarting
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    : "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
              }`}
            >
              {isLive ? "live" : isStarting ? "loading" : "cwd"}
            </span>
          </div>
        </div>

        {/* Content area */}
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
            <span className="text-[10px] text-[#6c7086]">
              {path || status?.workspace || "no folder"}
            </span>
            <span className="text-[10px] text-[#585b70] italic">
              Primeira execucao pode demorar (download do servidor)
            </span>
            <button
              onClick={handleStop}
              className="text-[11px] text-[#6c7086] hover:text-red-400 transition-colors nodrag"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            {detection && !detection.found && (
              <p className="text-[11px] text-red-400 text-center">
                VS Code not found. Install from{" "}
                <a
                  href="https://code.visualstudio.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-red-300"
                >
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

            {/* Primary action: Browse folder */}
            <button
              onClick={handleBrowse}
              disabled={!detection?.found}
              className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-[#313244] disabled:text-[#6c7086] text-white text-sm font-medium rounded-lg transition-colors nodrag"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 4.5A1.5 1.5 0 013.5 3h3.379a1.5 1.5 0 011.06.44l.622.62a1.5 1.5 0 001.06.44H12.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Open Folder
            </button>

            <button
              onClick={handleStartEmpty}
              disabled={!detection?.found}
              className="text-[11px] text-[#6c7086] hover:text-cyan-400 disabled:hover:text-[#6c7086] transition-colors nodrag"
            >
              or start without folder
            </button>

            {path && (
              <span className="text-[10px] text-[#6c7086] truncate max-w-full">
                Last: {path}
              </span>
            )}
          </div>
        )}

        {/* Status bar — shows resolved path for debugging */}
        <div className="flex items-center justify-between px-3 py-1 bg-[#11111b]/80 border-t border-[#313244]/50 select-none">
          <span className="text-[10px] text-[#6c7086] truncate max-w-[300px]" title={path || status?.workspace || ""}>
            {isLive
              ? `${status.url} | ${path || status.workspace || "no folder"}`
              : path || "no folder selected"}
          </span>
          <span className="text-[10px] text-cyan-400/60">
            {isLive
              ? `port ${status.port}`
              : detection?.source
                ? `via ${detection.source}`
                : "vscode"}
          </span>
        </div>
      </div>

      {/* Source handle: connects TO terminals */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-[#181825]"
      />
    </>
  );
}

export default memo(VSCodeNode);

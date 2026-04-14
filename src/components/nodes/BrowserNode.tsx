import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { invoke } from "../../lib/electron";
import type { BrowserNodeData, ProxyStatus } from "../../types";
import { isElectron } from "../../lib/electron";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#f43f5e";
const HANDLES = [{ type: "source" as const, position: Position.Right, color: "#f43f5e" }];

function parseLocalhostPort(url: string): number | null {
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      return parseInt(u.port, 10) || (u.protocol === "https:" ? 443 : 80);
    }
  } catch { /* invalid URL */ }
  return null;
}

/** Normalize raw user input into a valid URL. Returns null if unresolvable. */
function sanitizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already has scheme
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // localhost shorthand (e.g. "localhost:3000", "127.0.0.1:8080")
  if (/^(localhost|127\.0\.0\.1)(:\d+)?/i.test(trimmed)) return `http://${trimmed}`;

  // Has a dot → treat as domain (e.g. "google.com", "docs.rs/axum")
  if (trimmed.includes(".")) return `https://${trimmed}`;

  // Bare word without dot (e.g. "youtube") → not a valid URL
  return null;
}

function BrowserNode({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as BrowserNodeData;
  const label = nodeData.label ?? "Browser";

  const hibernatedGroups = useCanvasStore((s) => s.hibernatedGroups);
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const [url, setUrl] = useState(nodeData.url || "");
  const [activeUrl, setActiveUrl] = useState(nodeData.url || "");
  const [proxyPort, setProxyPort] = useState<number | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
  const proxyPortRef = useRef<number | null>(null);
  proxyPortRef.current = proxyPort;

  const persistUrl = useCallback(
    (newUrl: string) => {
      setNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, url: newUrl } } : n),
      );
      syncDebounced();
    },
    [id, setNodes, syncDebounced],
  );

  const navigate = useCallback(
    async (targetUrl: string) => {
      const normalizedUrl = sanitizeUrl(targetUrl);
      if (!normalizedUrl) {
        setError("URL invalida. Use um dominio completo (ex: google.com) ou localhost:porta.");
        return;
      }
      setUrl(normalizedUrl);
      setError(null);
      if (proxyPortRef.current && isElectron()) {
        await invoke("stop_proxy", { instanceId: id }).catch(() => {});
        setProxyPort(null);
      }
      const localhostPort = parseLocalhostPort(normalizedUrl);
      if (localhostPort && isElectron()) {
        // Localhost: route through Express proxy for WebSocket support
        try {
          const ps = await invoke<ProxyStatus>("start_proxy", { instanceId: id, targetPort: localhostPort });
          setProxyPort(ps.proxy_port);
          const parsed = new URL(normalizedUrl);
          const proxyBase = `http://127.0.0.1:${ps.proxy_port}/proxy/${id}`;
          const pathAndQuery = parsed.pathname + parsed.search + parsed.hash;
          setActiveUrl(`${proxyBase}${pathAndQuery}`);
        } catch (e) {
          setError(`Proxy failed: ${e}`);
          setActiveUrl(normalizedUrl);
        }
      } else {
        // External URL: Electron session.webRequest strips X-Frame-Options/CSP
        // so iframe loads the URL directly — no proxy needed
        setActiveUrl(normalizedUrl);
      }
      setIframeKey((k) => k + 1);
      persistUrl(normalizedUrl);
    },
    [id, persistUrl],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); navigate(url); }
  }, [url, navigate]);

  const handleReload = useCallback(() => { setIframeKey((k) => k + 1); }, []);

  useEffect(() => {
    return () => { if (isElectron()) invoke("stop_proxy", { instanceId: id }).catch(() => {}); };
  }, [id]);

  useEffect(() => {
    if (isHibernated && isElectron()) {
      invoke("stop_proxy", { instanceId: id }).catch(() => {});
      setProxyPort(null);
      setActiveUrl("");
    }
  }, [isHibernated, id]);

  useEffect(() => {
    if (nodeData.url && !activeUrl && !isHibernated && isElectron()) navigate(nodeData.url);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        badges={<span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-rose-500/20 text-rose-400 border-rose-500/30">web</span>}
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-center" style={{ color: "var(--mx-text-secondary)" }}>
            Use a versao Desktop para browser embarcado.
          </p>
        </div>
      </NodeWrapper>
    );
  }

  // Hibernated
  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={400}
        minHeight={300}
        label={label}
        badges={<span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-rose-500/20 text-rose-400 border-rose-500/30">sleep</span>}
        statusLeft={url || "no URL set"}
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--mx-text-muted)" }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className="text-sm" style={{ color: "var(--mx-text-muted)" }}>Hibernated</span>
          </div>
        </div>
      </NodeWrapper>
    );
  }

  const isLive = !!activeUrl;

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={BORDER_COLOR}
      minWidth={400}
      minHeight={300}
      label={label}
      titleBarExtra={
        isLive ? (
          <button onClick={handleReload} className="px-1.5 py-0.5 text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded transition-colors nodrag" title="Reload page">
            Reload
          </button>
        ) : null
      }
      badges={
        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
          isLive ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border-rose-500/30"
        }`}>
          {isLive ? "live" : "idle"}
        </span>
      }
      statusLeft={<span className="truncate max-w-[300px]" title={activeUrl}>{activeUrl || "no page loaded"}</span>}
      statusRight={<span style={{ color: "rgba(244,63,94,0.6)" }}>{proxyPort ? `proxy :${proxyPort}` : "browser"}</span>}
      handles={HANDLES}
    >
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: "1px solid var(--mx-border)" }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="http://localhost:3000"
          className="flex-1 text-xs px-2.5 py-1.5 rounded border outline-none nodrag nowheel"
          style={{
            background: "var(--mx-input-bg)",
            borderColor: "var(--mx-input-border)",
            color: "var(--mx-text)",
          }}
          spellCheck={false}
        />
        <button
          onClick={() => navigate(url)}
          disabled={!url.trim()}
          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-[#313244] disabled:text-[#6c7086] text-white text-xs font-medium rounded transition-colors nodrag"
        >
          Go
        </button>
      </div>

      {/* iframe or empty state */}
      {isLive ? (
        <iframe
          key={iframeKey}
          src={activeUrl}
          className="flex-1 min-h-0 w-full border-0 bg-white nodrag nowheel"
          title={`Browser: ${url}`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: "var(--mx-text-muted)" }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <p className="text-sm text-center" style={{ color: "var(--mx-text-secondary)" }}>
            Digite uma URL e clique Go
          </p>
          <p className="text-[11px] text-center max-w-[280px]" style={{ color: "var(--mx-text-muted)" }}>
            URLs localhost passam pelo reverse proxy automaticamente (strip X-Frame-Options).
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 bg-red-500/10" style={{ borderTop: "1px solid rgba(239,68,68,0.2)" }}>
          <p className="text-[10px] text-red-400 truncate" title={error}>{error}</p>
        </div>
      )}
    </NodeWrapper>
  );
}

export default memo(BrowserNode);

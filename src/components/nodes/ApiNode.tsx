import { memo, useState, useCallback } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import type { ApiNodeData } from "../../types";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import { useShallow } from "zustand/react/shallow";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#f97316";
const HANDLES = [{ type: "source" as const, position: Position.Right, color: "#f97316" }];
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
const METHOD_COLORS: Record<string, string> = {
  GET: "#10b981",
  POST: "#f59e0b",
  PUT: "#3b82f6",
  DELETE: "#ef4444",
  PATCH: "#a855f7",
};

function highlightJson(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"([^"]+)":/g, '<span style="color:#10b981">"$1"</span>:')
    .replace(/: "(.*?)"/g, ': <span style="color:#f59e0b">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span style="color:#3b82f6">$1</span>')
    .replace(/: (true|false|null)/g, ': <span style="color:#a855f7">$1</span>');
}

type RequestState = "idle" | "loading" | "done" | "error";
type HttpMethod = (typeof METHODS)[number];

function ApiNode({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as ApiNodeData;
  const label = nodeData.label ?? "API";

  const hibernatedGroups = useCanvasStore(useShallow((s) => s.hibernatedGroups));
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const [method, setMethod] = useState<HttpMethod>(nodeData.method ?? "GET");
  const [url, setUrl] = useState(nodeData.url ?? "");
  const [body, setBody] = useState(nodeData.body ?? "");
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(nodeData.headers ?? []);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseBody, setResponseBody] = useState("");
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [showHeaders, setShowHeaders] = useState(false);

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  const persistData = useCallback(
    (updates: Partial<Pick<ApiNodeData, "method" | "url" | "body" | "headers">>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...updates } } : n)),
      );
      syncDebounced();
    },
    [id, setNodes, syncDebounced],
  );

  const handleSend = useCallback(async () => {
    if (!url.trim()) return;
    setRequestState("loading");
    setResponseBody("");
    setResponseStatus(null);
    setResponseTime(null);

    const start = performance.now();
    try {
      const fetchHeaders: Record<string, string> = {};
      headers.forEach((h) => {
        if (h.key.trim()) fetchHeaders[h.key.trim()] = h.value;
      });

      const hasBody = ["POST", "PUT", "PATCH"].includes(method);
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...fetchHeaders },
        body: hasBody && body.trim() ? body : undefined,
      });

      const elapsed = Math.round(performance.now() - start);
      setResponseTime(elapsed);
      setResponseStatus(res.status);

      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        setResponseBody(JSON.stringify(parsed, null, 2));
      } catch {
        setResponseBody(text);
      }
      setRequestState("done");
    } catch (e) {
      setResponseTime(Math.round(performance.now() - start));
      setResponseStatus(null);
      setResponseBody(String(e));
      setRequestState("error");
    }
  }, [url, method, body, headers]);

  const addHeader = useCallback(() => {
    const updated = [...headers, { key: "", value: "" }];
    setHeaders(updated);
    persistData({ headers: updated });
  }, [headers, persistData]);

  const updateHeader = useCallback(
    (idx: number, field: "key" | "value", val: string) => {
      const updated = headers.map((h, i) => (i === idx ? { ...h, [field]: val } : h));
      setHeaders(updated);
      persistData({ headers: updated });
    },
    [headers, persistData],
  );

  const removeHeader = useCallback(
    (idx: number) => {
      const updated = headers.filter((_, i) => i !== idx);
      setHeaders(updated);
      persistData({ headers: updated });
    },
    [headers, persistData],
  );

  const methodColor = METHOD_COLORS[method] ?? "#7c3aed";
  const showBody = ["POST", "PUT", "PATCH"].includes(method);

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={400}
        minHeight={400}
        label={label}
        badges={
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-orange-500/20 text-orange-400 border-orange-500/30">
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
      minWidth={400}
      minHeight={400}
      label={label}
      badges={
        requestState === "loading" ? (
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-orange-500/20 text-orange-400 border-orange-500/30 animate-pulse">
            sending
          </span>
        ) : (
          <span
            className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-orange-500/20 border-orange-500/30"
            style={{ color: methodColor }}
          >
            {method}
          </span>
        )
      }
      statusLeft={responseStatus ? `${responseStatus} ${responseTime}ms` : "ready"}
      statusRight={<span style={{ color: "rgba(249,115,22,0.6)" }}>http</span>}
      handles={HANDLES}
    >
      <div className="flex-1 flex flex-col min-h-0 p-2 gap-2 nodrag nowheel">
        {/* Method + URL + Send */}
        <div className="flex gap-1.5">
          <select
            value={method}
            onChange={(e) => {
              const m = e.target.value as HttpMethod;
              setMethod(m);
              persistData({ method: m });
            }}
            className="text-xs px-2 py-1.5 rounded border outline-none font-semibold"
            style={{
              background: "var(--mx-input-bg)",
              borderColor: "var(--mx-input-border)",
              color: methodColor,
              width: 80,
            }}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              persistData({ url: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="https://api.example.com/endpoint"
            className="flex-1 text-xs px-2 py-1.5 rounded border outline-none"
            style={{
              background: "var(--mx-input-bg)",
              borderColor: "var(--mx-input-border)",
              color: "var(--mx-text)",
            }}
            spellCheck={false}
          />
          <button
            onClick={handleSend}
            disabled={requestState === "loading" || !url.trim()}
            className="px-3 py-1.5 text-white text-xs font-medium rounded transition-colors disabled:opacity-40"
            style={{ background: requestState === "loading" ? "#6b7280" : "#f97316" }}
          >
            {requestState === "loading" ? "..." : "Send"}
          </button>
        </div>

        {/* Headers toggle */}
        <button
          onClick={() => setShowHeaders(!showHeaders)}
          className="text-[10px] text-left"
          style={{ color: "var(--mx-text-muted)" }}
        >
          Headers ({headers.length}) {showHeaders ? "\u25BC" : "\u25B6"}
        </button>
        {showHeaders && (
          <div className="space-y-1">
            {headers.map((h, i) => (
              <div key={i} className="flex gap-1">
                <input
                  type="text"
                  value={h.key}
                  onChange={(e) => updateHeader(i, "key", e.target.value)}
                  placeholder="Key"
                  className="flex-1 text-[10px] px-1.5 py-1 rounded border outline-none"
                  style={{
                    background: "var(--mx-input-bg)",
                    borderColor: "var(--mx-input-border)",
                    color: "var(--mx-text)",
                  }}
                />
                <input
                  type="text"
                  value={h.value}
                  onChange={(e) => updateHeader(i, "value", e.target.value)}
                  placeholder="Value"
                  className="flex-1 text-[10px] px-1.5 py-1 rounded border outline-none"
                  style={{
                    background: "var(--mx-input-bg)",
                    borderColor: "var(--mx-input-border)",
                    color: "var(--mx-text)",
                  }}
                />
                <button
                  onClick={() => removeHeader(i)}
                  className="text-[10px] text-red-400 px-1 hover:text-red-300 transition-colors"
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              onClick={addHeader}
              className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors"
            >
              + Add Header
            </button>
          </div>
        )}

        {/* Body (POST/PUT/PATCH) */}
        {showBody && (
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              persistData({ body: e.target.value });
            }}
            placeholder='{ "key": "value" }'
            className="text-[11px] font-mono px-2 py-1.5 rounded border outline-none resize-none min-h-[60px]"
            style={{
              background: "var(--mx-input-bg)",
              borderColor: "var(--mx-input-border)",
              color: "var(--mx-text)",
            }}
            spellCheck={false}
            rows={4}
          />
        )}

        {/* Response panel */}
        <div
          className="flex-1 min-h-0 flex flex-col rounded border overflow-hidden"
          style={{ borderColor: "var(--mx-border)" }}
        >
          {responseStatus !== null && (
            <div
              className="flex items-center gap-2 px-2 py-1"
              style={{ borderBottom: "1px solid var(--mx-border)", background: "var(--mx-titlebar)" }}
            >
              <span
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                  responseStatus < 300
                    ? "bg-emerald-500/20 text-emerald-400"
                    : responseStatus < 400
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-red-500/20 text-red-400"
                }`}
              >
                {responseStatus}
              </span>
              {responseTime !== null && (
                <span className="text-[10px]" style={{ color: "var(--mx-text-muted)" }}>
                  {responseTime}ms
                </span>
              )}
            </div>
          )}
          {responseBody ? (
            <pre
              className="flex-1 min-h-0 overflow-auto p-2 text-[10px] font-mono leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--mx-text)", background: "var(--mx-input-bg)", margin: 0 }}
              dangerouslySetInnerHTML={{ __html: highlightJson(responseBody) }}
            />
          ) : (
            <div
              className="flex-1 flex items-center justify-center p-2"
              style={{ background: "var(--mx-input-bg)" }}
            >
              <span className="text-[10px]" style={{ color: "var(--mx-text-muted)" }}>
                {requestState === "error" ? "Request failed" : "Response will appear here..."}
              </span>
            </div>
          )}
        </div>
      </div>
    </NodeWrapper>
  );
}

export default memo(ApiNode);

import { memo, useState, useEffect, useMemo, useCallback } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../store/canvasStore";
import { listen, isElectron } from "../lib/electron";
import type { TerminalNodeData } from "../types";

interface TerminalEntry {
  nodeId: string;
  label: string;
  ptyId: string | undefined;
  role: string;
  status: string;
}

interface TerminalGroup {
  projectName: string;
  entries: TerminalEntry[];
}

function dotClass(status: string): string {
  if (status === "awaiting_approval") return "hud-dot-approval";
  if (status === "active") return "hud-dot-active";
  return "";
}

function dotColor(status: string): string {
  if (status === "awaiting_approval") return "#ef4444";
  if (status === "active") return "#3b82f6";
  if (status === "idle") return "#64748b";
  return "#ef4444"; // disconnected
}

function statusLabel(status: string): string {
  if (status === "awaiting_approval") return "Aguardando";
  if (status === "active") return "Ativo";
  if (status === "idle") return "Idle";
  return "Off";
}

function GlobalStatusHUD() {
  const [open, setOpen] = useState(true);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  const terminals: Node[] = useCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type === "terminal")),
  );

  const { setCenter } = useReactFlow();

  // Build stable key for listener effect dependency
  const ptyIdKey = useMemo(
    () =>
      terminals
        .map((t) => (t.data as TerminalNodeData).ptyId ?? "")
        .filter(Boolean)
        .sort()
        .join(","),
    [terminals],
  );

  // Listen to pty-status events for all terminals
  useEffect(() => {
    if (!isElectron()) return;
    const unlisteners: (() => void)[] = [];
    for (const term of terminals) {
      const ptyId = (term.data as TerminalNodeData).ptyId;
      if (!ptyId) continue;
      const unlisten = listen<{ ptyId: string; status: string }>(
        `pty-status-${ptyId}`,
        ({ ptyId: pid, status }) => {
          setStatusMap((prev) => ({ ...prev, [pid]: status }));
        },
      );
      unlisteners.push(unlisten);
    }
    return () => unlisteners.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyIdKey]);

  // Group terminals by cwd (last folder segment)
  const groups = useMemo(() => {
    const map = new Map<string, TerminalGroup>();
    for (const node of terminals) {
      const d = node.data as TerminalNodeData;
      const cwd = d.cwd ?? "";
      const projectName = cwd
        ? (cwd.split(/[\\/]/).filter(Boolean).pop() ?? "Sem Projeto")
        : "Sem Projeto";
      if (!map.has(projectName)) {
        map.set(projectName, { projectName, entries: [] });
      }
      map.get(projectName)!.entries.push({
        nodeId: node.id,
        label: d.label ?? "Terminal",
        ptyId: d.ptyId,
        role: d.role ?? "Agent",
        status: d.ptyId ? (statusMap[d.ptyId] ?? "active") : "disconnected",
      });
    }
    return Array.from(map.values());
  }, [terminals, statusMap]);

  // Count alerts for badge
  const alertCount = useMemo(
    () =>
      groups.reduce(
        (sum, g) =>
          sum + g.entries.filter((e) => e.status === "awaiting_approval").length,
        0,
      ),
    [groups],
  );

  const navigateTo = useCallback(
    (nodeId: string) => {
      const node = terminals.find((n) => n.id === nodeId);
      if (!node) return;
      const w = (node.style?.width as number) ?? 520;
      const h = (node.style?.height as number) ?? 360;
      setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: 1.2,
        duration: 800,
      });
    },
    [terminals, setCenter],
  );

  if (terminals.length === 0) return null;

  return (
    <div
      className="select-none"
      style={{
        marginLeft: 60,
        background: "var(--mx-glass-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid var(--mx-glass-border)",
        borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        minWidth: open ? 200 : "auto",
        maxHeight: 320,
        overflow: "hidden",
        transition: "min-width 0.2s ease",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 cursor-pointer"
        style={{
          background: "transparent",
          border: "none",
          borderBottom: open ? "1px solid var(--mx-border)" : "none",
          color: "var(--mx-text)",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          style={{ color: "#06b6d4", flexShrink: 0 }}
        >
          <rect
            x="2"
            y="3"
            width="16"
            height="11"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M7 17h6M10 14v3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span
          className="text-[11px] font-semibold tracking-wider"
          style={{ color: "var(--mx-text-secondary)" }}
        >
          SENTINELA
        </span>

        {alertCount > 0 && (
          <span
            className="hud-dot-approval text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}
          >
            {alertCount}
          </span>
        )}

        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            marginLeft: "auto",
            color: "var(--mx-text-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        >
          <path
            d="M3 4.5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Body */}
      {open && (
        <div
          className="overflow-y-auto"
          style={{ maxHeight: 260, padding: "4px 0" }}
        >
          {groups.map((group) => (
            <div key={group.projectName} style={{ marginBottom: 2 }}>
              {/* Project name */}
              <div
                className="flex items-center gap-1.5 px-3 py-1"
                style={{ color: "var(--mx-text-muted)" }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{ flexShrink: 0 }}
                >
                  <path
                    d="M2 4.5V12a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3.5H3a1 1 0 00-1 1z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-[10px] font-semibold tracking-wide uppercase">
                  {group.projectName}
                </span>
              </div>

              {/* Terminal entries */}
              {group.entries.map((entry) => (
                <button
                  key={entry.nodeId}
                  onClick={() => navigateTo(entry.nodeId)}
                  className="flex items-center gap-2 w-full px-4 py-1 cursor-pointer transition-colors"
                  style={{
                    background: "transparent",
                    border: "none",
                    color:
                      entry.status === "awaiting_approval"
                        ? "#ef4444"
                        : "var(--mx-text-secondary)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "var(--mx-sidebar-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {/* Status dot */}
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${dotClass(entry.status)}`}
                    style={{ background: dotColor(entry.status) }}
                  />
                  {/* Label */}
                  <span
                    className={`text-[11px] truncate ${entry.status === "awaiting_approval" ? "font-semibold hud-dot-approval" : ""}`}
                  >
                    {entry.label}
                  </span>
                  {/* Status tag */}
                  <span
                    className="text-[9px] ml-auto shrink-0"
                    style={{ color: "var(--mx-text-muted)" }}
                  >
                    {statusLabel(entry.status)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(GlobalStatusHUD);

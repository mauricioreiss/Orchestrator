import { memo } from "react";
import { useSystemMetrics } from "../hooks/useSystemMetrics";

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function cpuColor(percent: number): string {
  if (percent >= 80) return "#ef4444";
  if (percent >= 50) return "#f59e0b";
  return "#10b981";
}

function ramColor(percent: number): string {
  if (percent >= 85) return "#ef4444";
  if (percent >= 60) return "#f59e0b";
  return "#06b6d4";
}

function StatusBar() {
  const metrics = useSystemMetrics();
  const cpu = metrics.cpu_usage;
  const ramPct = metrics.memory_percent;

  return (
    <div
      className="flex items-center gap-4 px-4 py-1.5 rounded-xl select-none"
      style={{
        background: "var(--mx-glass-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid var(--mx-glass-border)",
        boxShadow: "var(--mx-node-shadow)",
      }}
    >
      {/* CPU */}
      <div className="flex items-center gap-2">
        <span
          className="text-[11px] font-medium tracking-wide uppercase"
          style={{ color: "var(--mx-text-muted)" }}
        >
          CPU
        </span>
        <div
          className="w-16 h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--mx-surface-alt)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(cpu, 100)}%`,
              backgroundColor: cpuColor(cpu),
            }}
          />
        </div>
        <span
          className="text-xs font-mono tabular-nums min-w-[3ch] text-right"
          style={{ color: cpuColor(cpu) }}
        >
          {cpu.toFixed(0)}%
        </span>
      </div>

      <div className="w-px h-4" style={{ background: "var(--mx-border)" }} />

      {/* RAM */}
      <div className="flex items-center gap-2">
        <span
          className="text-[11px] font-medium tracking-wide uppercase"
          style={{ color: "var(--mx-text-muted)" }}
        >
          RAM
        </span>
        <div
          className="w-16 h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--mx-surface-alt)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(ramPct, 100)}%`,
              backgroundColor: ramColor(ramPct),
            }}
          />
        </div>
        <span
          className="text-xs font-mono tabular-nums"
          style={{ color: ramColor(ramPct) }}
        >
          {formatBytes(metrics.memory_used)}
        </span>
        <span className="text-[10px]" style={{ color: "var(--mx-text-muted)" }}>
          / {formatBytes(metrics.memory_total)}
        </span>
      </div>

      <div className="w-px h-4" style={{ background: "var(--mx-border)" }} />

      {/* Process counts */}
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--mx-text-muted)" }}>
        <span className="font-mono tabular-nums">
          {metrics.active_ptys} PTY
        </span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span className="font-mono tabular-nums">
          {metrics.active_code_servers} VS Code
        </span>
      </div>

      {/* Activity indicator */}
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
    </div>
  );
}

export default memo(StatusBar);

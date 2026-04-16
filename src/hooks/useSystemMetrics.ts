import { useEffect, useState } from "react";
import { invoke } from "../lib/electron";
import { isElectron } from "../lib/electron";
import type { SystemMetrics } from "../types";

const POLL_INTERVAL_MS = 2000;

const EMPTY_METRICS: SystemMetrics = {
  cpu_usage: 0,
  memory_used: 0,
  memory_total: 0,
  memory_percent: 0,
  active_ptys: 0,
  active_code_servers: 0,
};

export function useSystemMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics>(EMPTY_METRICS);

  useEffect(() => {
    if (!isElectron()) return;

    let active = true;

    const poll = async () => {
      try {
        const result = await invoke<SystemMetrics>("get_system_metrics");
        if (active) setMetrics(result);
      } catch (err) {
        console.error("[orchestrated-space] get_system_metrics failed:", err);
      }
    };

    // Initial fetch
    poll();

    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return metrics;
}

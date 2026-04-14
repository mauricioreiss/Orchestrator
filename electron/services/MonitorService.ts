import os from "os";
import type { SystemMetrics } from "../types";

interface CpuTicks {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
}

/**
 * System metrics collector using Node.js os module.
 * Port of the Rust MonitorService (sysinfo crate).
 * CPU usage is calculated as the delta between two consecutive snapshots,
 * so the first call always returns 0% CPU.
 */
export class MonitorService {
  private prevTicks: CpuTicks[] | null = null;

  /**
   * Collect current system metrics.
   * CPU is a delta calculation: (total - idle) / total across all cores.
   * Memory comes straight from os.totalmem() / os.freemem().
   * Process counts are passed in because the caller (main process) owns those registries.
   */
  getMetrics(activePtys: number, activeCodeServers: number): SystemMetrics {
    const cpus = os.cpus();
    const currentTicks = cpus.map((cpu): CpuTicks => cpu.times);

    let cpuUsage = 0;

    if (this.prevTicks !== null && this.prevTicks.length === currentTicks.length) {
      let totalDelta = 0;
      let idleDelta = 0;

      for (let i = 0; i < currentTicks.length; i++) {
        const prev = this.prevTicks[i];
        const curr = currentTicks[i];

        const prevTotal =
          prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
        const currTotal =
          curr.user + curr.nice + curr.sys + curr.idle + curr.irq;

        totalDelta += currTotal - prevTotal;
        idleDelta += curr.idle - prev.idle;
      }

      if (totalDelta > 0) {
        cpuUsage = ((totalDelta - idleDelta) / totalDelta) * 100;
      }
    }

    this.prevTicks = currentTicks;

    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memUsed = memTotal - memFree;
    const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

    return {
      cpu_usage: Math.round(cpuUsage * 100) / 100,
      memory_used: memUsed,
      memory_total: memTotal,
      memory_percent: Math.round(memPercent * 100) / 100,
      active_ptys: activePtys,
      active_code_servers: activeCodeServers,
    };
  }
}

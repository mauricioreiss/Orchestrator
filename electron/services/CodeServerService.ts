import { ChildProcess, spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import treeKill from "tree-kill";
import log from "../log";
import type { CodeServerDetection, CodeServerStatus } from "../types";

// ---------------------------------------------------------------------------
// Internal instance state
// ---------------------------------------------------------------------------

interface CodeServerInstance {
  process: ChildProcess;
  port: number;
  workspace: string;
  url: string;
  token: string;
  stderrBuf: string;
  /** True when the .cmd launcher exited but the server is still alive on the port. */
  launcherExited: boolean;
}

// ---------------------------------------------------------------------------
// CodeServerService
//
// Manages multiple VS Code web server instances (one per VSCodeNode).
// Uses `code serve-web` (VS Code built-in) instead of code-server.
// Each instance binds to 127.0.0.1:{port}.
// ---------------------------------------------------------------------------

export class CodeServerService {
  private instances = new Map<string, CodeServerInstance>();
  private nextPort = 13370;

  // -----------------------------------------------------------------------
  // Detect VS Code binary
  // -----------------------------------------------------------------------

  detect(): CodeServerDetection {
    // 1. Check PATH via `where.exe` (Windows) or `which` (Unix)
    const isWin = process.platform === "win32";
    const whichCmd = isWin ? "where.exe" : "which";

    try {
      const stdout = execSync(`${whichCmd} code`, {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      if (stdout) {
        // On Windows, `where` may return multiple lines. Prefer code.cmd.
        const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const cmdLine = lines.find((l) => l.endsWith("code.cmd"));
        const chosen = cmdLine ?? lines[0];

        if (chosen) {
          return { found: true, path: chosen, source: "path" };
        }
      }
    } catch {
      // where/which failed, continue to fallback
    }

    // 2. Fallback: standard install via %LOCALAPPDATA% (Windows only)
    if (isWin) {
      const local = process.env.LOCALAPPDATA;
      if (local) {
        const standard = path.join(
          local,
          "Programs",
          "Microsoft VS Code",
          "bin",
          "code.cmd",
        );
        if (fs.existsSync(standard)) {
          return { found: true, path: standard, source: "standard" };
        }
      }
    }

    // 3. macOS: standard /Applications path
    if (process.platform === "darwin") {
      const macPath = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
      if (fs.existsSync(macPath)) {
        return { found: true, path: macPath, source: "standard" };
      }
    }

    return { found: false, path: null, source: null };
  }

  // -----------------------------------------------------------------------
  // Start
  // -----------------------------------------------------------------------

  start(
    instanceId: string,
    workspace?: string,
    binaryPath?: string,
  ): CodeServerStatus {
    if (this.instances.has(instanceId)) {
      throw new Error(
        `VS Code server already running for instance ${instanceId}`,
      );
    }

    const primaryBinary = binaryPath ?? "code";
    const port = this.allocatePort();
    const token = uuidv4();
    const url = `http://127.0.0.1:${port}`;
    const ws = workspace ?? "";

    log.info(
      `[maestri-x] Starting VS Code server ${instanceId} on port ${port}`,
    );

    // Strategy: try Code.exe directly (stays alive), then .cmd fallback
    let child = this.trySpawnCodeExe(primaryBinary, port, ws);

    if (!child) {
      // Direct spawn as fallback
      child = this.spawnServeWeb(primaryBinary, port, ws);
    }

    if (!child) {
      // Last resort: standard Windows install path
      if (process.platform === "win32") {
        const local = process.env.LOCALAPPDATA;
        if (local) {
          const fallback = path.join(
            local,
            "Programs",
            "Microsoft VS Code",
            "bin",
            "code.cmd",
          );
          if (fs.existsSync(fallback)) {
            log.info(`[maestri-x] Trying fallback: ${fallback}`);
            child = this.spawnServeWeb(fallback, port, ws);
          }
        }
      }
    }

    if (!child) {
      throw new Error(
        `Failed to start VS Code serve-web. Binary: ${primaryBinary}`,
      );
    }

    const instance: CodeServerInstance = {
      process: child,
      port,
      workspace: ws,
      url,
      token,
      stderrBuf: "",
      launcherExited: false,
    };

    // Drain stderr to prevent pipe deadlock and capture error output
    child.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString("utf-8");
      if (instance.stderrBuf.length < 8192) {
        instance.stderrBuf += line;
      }
    });

    // Detect launcher exit (important for .cmd wrappers)
    child.on("exit", (code) => {
      if (code === 0 && this.instances.has(instanceId)) {
        // .cmd launcher may have exited while server runs detached.
        // Check TCP to confirm.
        setTimeout(() => {
          if (this.tcpCheck(port)) {
            log.info(
              `[maestri-x] VS Code launcher exited (code 0) but server alive on port ${port} -- TCP-only tracking`,
            );
            instance.launcherExited = true;
          }
        }, 500);
      }
    });

    this.instances.set(instanceId, instance);

    return {
      instance_id: instanceId,
      running: true,
      ready: false,
      port,
      url,
      workspace: ws,
      token,
      error_output: null,
    };
  }

  // -----------------------------------------------------------------------
  // Stop
  // -----------------------------------------------------------------------

  stop(instanceId: string): void {
    const inst = this.instances.get(instanceId);
    if (!inst) return; // Already stopped or never started — no-op

    this.instances.delete(instanceId);

    if (inst.launcherExited) {
      this.killByPort(inst.port);
    } else {
      this.killProcessTree(inst);
    }
  }

  // -----------------------------------------------------------------------
  // Stop All
  // -----------------------------------------------------------------------

  stopAll(): void {
    for (const [, inst] of this.instances) {
      if (inst.launcherExited) {
        this.killByPort(inst.port);
      } else {
        this.killProcessTree(inst);
      }
    }
    this.instances.clear();
  }

  // -----------------------------------------------------------------------
  // Status (includes TCP readiness check)
  // -----------------------------------------------------------------------

  status(instanceId: string): CodeServerStatus {
    const inst = this.instances.get(instanceId);

    if (!inst) {
      return {
        instance_id: instanceId,
        running: false,
        ready: false,
        port: 0,
        url: "",
        workspace: "",
        token: "",
        error_output: null,
      };
    }

    // If launcher already exited, rely on TCP only
    if (inst.launcherExited) {
      const ready = this.tcpCheck(inst.port);
      if (ready) {
        return {
          instance_id: instanceId,
          running: true,
          ready: true,
          port: inst.port,
          url: inst.url,
          workspace: inst.workspace,
          token: inst.token,
          error_output: null,
        };
      }

      // Server actually died
      const workspace = inst.workspace;
      this.instances.delete(instanceId);
      log.info(
        `[maestri-x] Detached VS Code server ${instanceId} is no longer reachable`,
      );
      return {
        instance_id: instanceId,
        running: false,
        ready: false,
        port: 0,
        url: "",
        workspace,
        token: "",
        error_output: "Server stopped responding",
      };
    }

    // Check if process is still alive
    if (inst.process.exitCode !== null) {
      // Process exited
      const exitCode = inst.process.exitCode;

      if (exitCode === 0) {
        // .cmd wrapper may have exited. Check TCP.
        const ready = this.tcpCheck(inst.port);
        if (ready) {
          inst.launcherExited = true;
          return {
            instance_id: instanceId,
            running: true,
            ready: true,
            port: inst.port,
            url: inst.url,
            workspace: inst.workspace,
            token: inst.token,
            error_output: null,
          };
        }
      }

      // Actually dead
      const workspace = inst.workspace;
      const stderrOut = inst.stderrBuf || null;
      const errorMsg = stderrOut
        ? `exit code: ${exitCode} | stderr: ${stderrOut}`
        : `exit code: ${exitCode}`;

      this.instances.delete(instanceId);
      log.info(
        `[maestri-x] VS Code server ${instanceId} died (port ${inst.port}): ${errorMsg}`,
      );

      return {
        instance_id: instanceId,
        running: false,
        ready: false,
        port: 0,
        url: "",
        workspace,
        token: "",
        error_output: errorMsg,
      };
    }

    // Process alive, check TCP readiness
    const ready = this.tcpCheck(inst.port);

    return {
      instance_id: instanceId,
      running: true,
      ready,
      port: inst.port,
      url: inst.url,
      workspace: inst.workspace,
      token: inst.token,
      error_output: null,
    };
  }

  // -----------------------------------------------------------------------
  // List (tokens masked)
  // -----------------------------------------------------------------------

  list(): CodeServerStatus[] {
    const result: CodeServerStatus[] = [];

    for (const [id, inst] of this.instances) {
      result.push({
        instance_id: id,
        running: true,
        ready: false, // list doesn't check TCP readiness
        port: inst.port,
        url: inst.url,
        workspace: inst.workspace,
        token: maskToken(inst.token),
        error_output: null,
      });
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Count
  // -----------------------------------------------------------------------

  count(): number {
    return this.instances.size;
  }

  // -----------------------------------------------------------------------
  // Internal: spawn Code.exe directly (avoids .cmd wrapper exiting)
  //
  // VS Code layout varies by version:
  //   Old: {root}/resources/app/out/cli.js
  //   New: {root}/{hash}/resources/app/out/cli.js
  // -----------------------------------------------------------------------

  private findCliJs(vscodeRoot: string): string | null {
    // Try direct path first (old layout)
    const direct = path.join(vscodeRoot, "resources", "app", "out", "cli.js");
    if (fs.existsSync(direct)) return direct;

    // New layout: {root}/{hashdir}/resources/app/out/cli.js
    try {
      const entries = fs.readdirSync(vscodeRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // Hash dirs are typically hex strings, skip known dirs like bin
        if (entry.name === "bin" || entry.name === "locales" || entry.name === "appx") continue;
        const candidate = path.join(vscodeRoot, entry.name, "resources", "app", "out", "cli.js");
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch { /* ignore */ }

    return null;
  }

  private trySpawnCodeExe(
    cmdPath: string,
    port: number,
    _ws: string,
  ): ChildProcess | null {
    const lower = cmdPath.toLowerCase();
    if (!lower.endsWith(".cmd") && !lower.endsWith(".bat")) return null;

    const binDir = path.dirname(cmdPath);
    const vscodeRoot = path.dirname(binDir);
    const codeExe = path.join(vscodeRoot, "Code.exe");
    const cliJs = this.findCliJs(vscodeRoot);

    if (!fs.existsSync(codeExe)) {
      log.info(`[maestri-x] Code.exe not found at ${codeExe}`);
      return null;
    }
    if (!cliJs) {
      log.info(`[maestri-x] cli.js not found in ${vscodeRoot}`);
      return null;
    }

    const userDataDir = path.join(
      os.tmpdir(),
      `maestri-x-vscode-${port}`,
    );

    log.info(
      `[maestri-x] spawn Code.exe directly: ELECTRON_RUN_AS_NODE=1 "${codeExe}" "${cliJs}" serve-web --host 127.0.0.1 --port ${port}`,
    );

    try {
      const child = spawn(
        codeExe,
        [
          cliJs,
          "serve-web",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--server-data-dir",
          userDataDir,
          "--without-connection-token",
          "--accept-server-license-terms",
          "--disable-telemetry",
        ],
        {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          cwd: vscodeRoot,
          stdio: ["ignore", "ignore", "pipe"],
        },
      );

      log.info(`[maestri-x] Code.exe spawned (PID: ${child.pid})`);
      return child;
    } catch (e) {
      log.info(`[maestri-x] Code.exe spawn failed: ${e}`);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: spawn via binary directly (for non-.cmd or as fallback)
  // -----------------------------------------------------------------------

  private spawnServeWeb(
    binary: string,
    port: number,
    _ws: string,
  ): ChildProcess | null {
    const userDataDir = path.join(
      os.tmpdir(),
      `maestri-x-vscode-${port}`,
    );

    const args = [
      "serve-web",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--server-data-dir",
      userDataDir,
      "--without-connection-token",
      "--accept-server-license-terms",
      "--disable-telemetry",
    ];

    log.info(
      `[maestri-x] spawn_serve_web (fallback): ${binary} ${args.join(" ")}`,
    );

    try {
      const binaryDir = path.dirname(binary);
      const isCmd = binary.toLowerCase().endsWith(".cmd") || binary.toLowerCase().endsWith(".bat");
      const opts: Parameters<typeof spawn>[2] = {
        stdio: ["ignore", "ignore", "pipe"],
        // .cmd/.bat files require shell: true on Windows
        shell: isCmd,
      };

      if (binaryDir && fs.existsSync(binaryDir)) {
        opts.cwd = binaryDir;
      }

      return spawn(binary, args, opts);
    } catch (e) {
      log.info(`[maestri-x] spawn_serve_web failed: ${e}`);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: TCP readiness check (synchronous)
  //
  // Uses execSync to run a tiny Node.js script that attempts a TCP
  // connection. This blocks the main thread briefly (up to 500ms) but
  // matches the Rust behavior and keeps status() synchronous.
  // -----------------------------------------------------------------------

  private tcpCheck(port: number): boolean {
    try {
      const script =
        `const s=require("net").createConnection({port:${port},host:"127.0.0.1"});` +
        `s.setTimeout(500);` +
        `s.on("connect",()=>{s.destroy();process.exit(0)});` +
        `s.on("error",()=>process.exit(1));` +
        `s.on("timeout",()=>{s.destroy();process.exit(1)})`;

      execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
        timeout: 2000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: kill process and entire child tree
  // -----------------------------------------------------------------------

  private killProcessTree(inst: CodeServerInstance): void {
    const pid = inst.process.pid;

    if (pid == null) {
      try { inst.process.kill(); } catch { /* already dead */ }
      return;
    }

    // tree-kill sends SIGKILL to entire process tree (cross-platform)
    treeKill(pid, "SIGKILL", (err) => {
      if (err) {
        log.info(`[maestri-x] tree-kill failed for PID ${pid}: ${err.message}, trying port fallback`);
        this.killByPort(inst.port);
      } else {
        log.info(`[maestri-x] tree-kill OK (PID ${pid})`);
      }
    });
  }

  /** Collect all tracked PIDs for external cleanup (e.g. before-quit sweep). */
  getAllPids(): number[] {
    const pids: number[] = [];
    for (const inst of this.instances.values()) {
      if (inst.process.pid != null) pids.push(inst.process.pid);
    }
    return pids;
  }

  // -----------------------------------------------------------------------
  // Internal: kill process by port
  // -----------------------------------------------------------------------

  private killByPort(port: number): void {
    if (process.platform === "win32") {
      // Windows: netstat + taskkill
      try {
        const stdout = execSync(
          `cmd /C netstat -ano -p TCP`,
          { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
        );

        const portStr = `:${port}`;
        for (const line of stdout.split("\n")) {
          if (line.includes(portStr) && line.includes("LISTENING")) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            const pidNum = parseInt(pid, 10);
            if (!isNaN(pidNum) && pidNum > 0) {
              log.info(
                `[maestri-x] Killing detached server PID ${pidNum} on port ${port}`,
              );
              try {
                execSync(`taskkill /F /PID ${pidNum}`, {
                  stdio: ["pipe", "pipe", "pipe"],
                  timeout: 5000,
                });
              } catch {
                // taskkill may fail if process already gone
              }
              return;
            }
          }
        }
      } catch {
        // netstat failed
      }
      log.info(
        `[maestri-x] No process found listening on port ${port}`,
      );
    } else {
      // Unix: fuser -k
      try {
        execSync(`fuser -k ${port}/tcp`, {
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 5000,
        });
      } catch {
        // fuser may not be available or port not in use
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internal: port allocation (13370-13399 range, wraps around)
  // -----------------------------------------------------------------------

  private allocatePort(): number {
    const usedPorts = new Set(
      Array.from(this.instances.values()).map((i) => i.port),
    );

    // Try up to 30 ports in the range
    for (let attempt = 0; attempt < 30; attempt++) {
      const port = this.nextPort;
      this.nextPort = port >= 13399 ? 13370 : port + 1;
      if (!usedPorts.has(port)) return port;
    }

    // Should never happen with <30 instances
    throw new Error("No available ports in 13370-13399 range");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskToken(token: string): string {
  if (token.length > 8) {
    return `${token.slice(0, 8)}...`;
  }
  return token;
}

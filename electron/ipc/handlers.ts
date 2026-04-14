import { ipcMain, type BrowserWindow } from "electron";
import type { PtyService } from "../services/PtyService";
import type { CodeServerService } from "../services/CodeServerService";
import type { ContextService } from "../services/ContextService";
import type { PersistenceService } from "../services/PersistenceService";
import type { VaultService } from "../services/VaultService";
import type { SupervisorService } from "../services/SupervisorService";
import type { TranslatorService } from "../services/TranslatorService";
import type { ProxyService } from "../services/ProxyService";
import type { MonitorService } from "../services/MonitorService";
import type { CanvasGraph, ContextAction, SyncResult } from "../types";

interface Services {
  pty: PtyService;
  codeServer: CodeServerService;
  context: ContextService;
  persistence: PersistenceService;
  vault: VaultService;
  supervisor: SupervisorService;
  translator: TranslatorService;
  proxy: ProxyService;
  monitor: MonitorService;
  getWindow: () => BrowserWindow | null;
}

function executeContextActions(
  actions: ContextAction[],
  pty: PtyService,
  win: BrowserWindow | null,
): SyncResult {
  const result: SyncResult = {
    dispatched: 0,
    interrupted: 0,
    piped: 0,
    leader_contexts: 0,
    cwd_updates: 0,
  };

  for (const action of actions) {
    switch (action.type) {
      case "dispatch_note": {
        // Format ANSI injection
        const clearScreen = "\x1b[2J\x1b[H";
        const header = action.isLeaderContext
          ? `\x1b[1;32m━━━ LEADER BRIEFING ━━━\x1b[0m\n`
          : `\x1b[1;33m━━━ Context Injection ━━━\x1b[0m\n`;
        const formatted = `${clearScreen}${header}\x1b[37m${action.content}\x1b[0m\n\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n`;

        // Emit context-injection event to renderer (bypasses PTY stdin)
        win?.webContents.send(`context-injection-${action.ptyId}`, formatted);

        if (action.isLeaderContext) result.leader_contexts++;
        else result.dispatched++;
        break;
      }
      case "interrupt": {
        try {
          // Send Ctrl+C
          pty.write(action.ptyId, [0x03]);
          result.interrupted++;
        } catch { /* PTY may already be dead */ }
        break;
      }
      case "clear_instruction": {
        const clearMsg = "\x1b[2J\x1b[H\x1b[90m[Context cleared]\x1b[0m\n";
        win?.webContents.send(`context-injection-${action.ptyId}`, clearMsg);
        break;
      }
      case "set_cwd": {
        result.cwd_updates++;
        break;
      }
      case "pipe_output": {
        try {
          const bytes = pty.pipeOutput(action.sourcePtyId, action.targetPtyId);
          if (bytes > 0) result.piped++;
        } catch { /* source/target may not exist */ }
        break;
      }
    }
  }

  return result;
}

export function registerIpcHandlers(services: Services): void {
  const { pty, codeServer, context, persistence, vault, supervisor, translator, proxy, monitor, getWindow } = services;

  // Utility
  ipcMain.handle("ping", () => "pong");

  // === PTY (7) ===
  ipcMain.handle("spawn_pty", (_e, args: { cols: number; rows: number; cwd?: string; label?: string }) =>
    pty.spawn(args.cols, args.rows, args.cwd, args.label),
  );
  ipcMain.handle("write_pty", (_e, args: { id: string; data: number[] }) =>
    pty.write(args.id, args.data),
  );
  ipcMain.handle("resize_pty", (_e, args: { id: string; cols: number; rows: number }) =>
    pty.resize(args.id, args.cols, args.rows),
  );
  ipcMain.handle("kill_pty", (_e, args: { id: string }) =>
    pty.kill(args.id),
  );
  ipcMain.handle("list_ptys", () => pty.list());
  ipcMain.handle("read_pty_output", (_e, args: { id: string }) =>
    pty.readOutput(args.id),
  );
  ipcMain.handle("pipe_pty_output", (_e, args: { sourceId: string; targetId: string }) =>
    pty.pipeOutput(args.sourceId, args.targetId),
  );

  // === Code Server (5) ===
  ipcMain.handle("detect_code_server", () => codeServer.detect());
  ipcMain.handle("start_code_server", (_e, args: { instanceId: string; workspace?: string; binaryPath?: string }) =>
    codeServer.start(args.instanceId, args.workspace, args.binaryPath),
  );
  ipcMain.handle("stop_code_server", (_e, args: { instanceId: string }) =>
    codeServer.stop(args.instanceId),
  );
  ipcMain.handle("code_server_status", (_e, args: { instanceId: string }) =>
    codeServer.status(args.instanceId),
  );
  ipcMain.handle("list_code_servers", () => codeServer.list());

  // === Context (2) ===
  ipcMain.handle("sync_canvas", (_e, args: { graph: CanvasGraph }) => {
    const actions = context.sync(args.graph);
    return executeContextActions(actions, pty, getWindow());
  });
  ipcMain.handle("send_interrupt", (_e, args: { ptyId: string }) =>
    pty.write(args.ptyId, [0x03]),
  );

  // === Supervisor (1) ===
  ipcMain.handle("cleanup_nodes", (_e, args: { removed: Array<{ node_id: string; node_type: string; process_id?: string }> }) =>
    supervisor.cleanupNodes(args.removed),
  );

  // === Vault (4) ===
  ipcMain.handle("list_vault_files", (_e, args: { vaultRoot: string; subfolder?: string }) =>
    vault.listFiles(args.vaultRoot, args.subfolder),
  );
  ipcMain.handle("read_vault_file", (_e, args: { vaultRoot: string; relativePath: string }) =>
    vault.readFile(args.vaultRoot, args.relativePath),
  );
  ipcMain.handle("search_vault", (_e, args: { vaultRoot: string; query: string }) =>
    vault.search(args.vaultRoot, args.query),
  );
  ipcMain.handle("search_vault_content", (_e, args: { vaultRoot: string; query: string; maxResults?: number }) =>
    vault.searchContent(args.vaultRoot, args.query, args.maxResults),
  );

  // === Persistence (7) ===
  ipcMain.handle("save_canvas", (_e, args: { id: string; name: string; data: string }) =>
    persistence.save(args.id, args.name, args.data),
  );
  ipcMain.handle("load_canvas", (_e, args: { id: string }) =>
    persistence.load(args.id),
  );
  ipcMain.handle("list_canvases", () => persistence.list());
  ipcMain.handle("delete_canvas", (_e, args: { id: string }) =>
    persistence.delete(args.id),
  );
  ipcMain.handle("get_setting", (_e, args: { key: string }) =>
    persistence.getSetting(args.key),
  );
  ipcMain.handle("set_setting", (_e, args: { key: string; value: string }) =>
    persistence.setSetting(args.key, args.value),
  );
  ipcMain.handle("get_all_settings", () => persistence.getAllSettings());

  // === Translator (1) ===
  ipcMain.handle("translate_and_inject", async (_e, args: { noteContent: string; ptyId: string; cwd: string; role: string }) =>
    translator.translateAndInject(args.noteContent, args.ptyId, args.cwd, args.role, persistence, pty, getWindow()),
  );

  // === Proxy (3) ===
  ipcMain.handle("start_proxy", (_e, args: { instanceId: string; targetPort: number }) =>
    proxy.startProxy(args.instanceId, args.targetPort),
  );
  ipcMain.handle("stop_proxy", (_e, args: { instanceId: string }) =>
    proxy.stopProxy(args.instanceId),
  );
  ipcMain.handle("list_proxies", () => proxy.list());

  // === Monitoring (1) ===
  ipcMain.handle("get_system_metrics", () =>
    monitor.getMetrics(pty.count(), codeServer.count()),
  );
}

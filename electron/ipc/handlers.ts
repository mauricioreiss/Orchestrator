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
import type { FileSystemService } from "../services/FileSystemService";
import log from "../log";
import type { CanvasGraph, ContextAction, SyncResult, ConnectedNodeInfo } from "../types";

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
  fileSystem: FileSystemService;
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
        // Write raw note content directly to PTY stdin (no ANSI banners)
        try {
          const payload = action.content + "\r\n";
          const bytes = Array.from(Buffer.from(payload, "utf-8"));
          pty.write(action.ptyId, bytes);
        } catch { /* PTY may already be dead */ }

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
        // No-op: context is now written directly to PTY stdin,
        // so "clearing" just means we stop sending new content.
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
  const { pty, codeServer, context, persistence, vault, supervisor, translator, proxy, monitor, fileSystem, getWindow } = services;

  // Utility
  ipcMain.handle("ping", () => "pong");

  // === PTY (7) ===
  ipcMain.handle("spawn_pty", (_e, args: { cols: number; rows: number; cwd?: string; label?: string }) => {
    // Hard-sanitize at IPC boundary: values may arrive as null/undefined/NaN after serialization
    const safeCols = Number(args.cols) || 80;
    const safeRows = Number(args.rows) || 24;
    const safeCwd = (typeof args.cwd === "string" && args.cwd) ? args.cwd : undefined;
    const safeLabel = (typeof args.label === "string" && args.label) ? args.label : undefined;
    return pty.spawn(safeCols, safeRows, safeCwd, safeLabel);
  });
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
  ipcMain.handle(
    "translate_and_inject",
    async (
      _e,
      args: {
        noteContent: string;
        ptyId: string;
        cwd: string;
        role: string;
        connectedNodes?: ConnectedNodeInfo[];
      },
    ) => {
      log.info(
        `[Backend] Recebido pedido de IA do NoteNode: ptyId=${args.ptyId}, connectedNodes=${(args.connectedNodes ?? []).length}`,
      );
      return translator.translateAndInject(
        args.noteContent,
        args.ptyId,
        args.cwd,
        args.role,
        args.connectedNodes ?? [],
        persistence,
        pty,
        context,
        getWindow(),
      );
    },
  );

  // === Swarm Write (1) ===
  // Frontend calls this instead of write_pty when content may contain <<SEND_TO:...>> tags.
  ipcMain.handle("swarm_write", (_e, args: { ptyId: string; text: string }) => {
    const graph = context.getLastGraph();
    return pty.smartWrite(args.ptyId, args.text, graph, getWindow());
  });

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

  // === File System (2) ===
  ipcMain.handle("fs_read_directory", (_e, args: { rootDir: string; subfolder?: string }) =>
    fileSystem.readDirectory(args.rootDir, args.subfolder),
  );
  ipcMain.handle("fs_read_file", (_e, args: { rootDir: string; relativePath: string }) =>
    fileSystem.readFile(args.rootDir, args.relativePath),
  );

  // === HITL (Human-in-the-Loop) (2) ===
  ipcMain.handle("approve_agent_action", (_e, args: { ptyId: string }) => {
    const cmd = pty.approvePending(args.ptyId);
    if (cmd) log.info(`[HITL] Approved: ${cmd}`);
    return { approved: !!cmd, command: cmd };
  });
  ipcMain.handle("reject_agent_action", (_e, args: { ptyId: string }) => {
    const cmd = pty.rejectPending(args.ptyId);
    if (cmd) log.info(`[HITL] Rejected: ${cmd}`);
    return { rejected: !!cmd, command: cmd };
  });

  // === Broadcast Handler ===
  // When PtyService detects [BROADCAST] in a terminal's output, fan-out
  // the command to all terminal nodes connected as targets from the source.
  pty.setBroadcastHandler((sourcePtyId, command) => {
    const graph = context.getLastGraph();
    if (!graph) return;

    // Find the terminal node that owns this PTY
    const sourceNode = graph.nodes.find(
      (n) => n.type === "terminal" && n.data?.ptyId === sourcePtyId,
    );
    if (!sourceNode) return;

    // Find all edges from source to other terminals
    const targetEdges = graph.edges.filter(
      (e) => e.source === sourceNode.id && e.targetType === "terminal",
    );

    const targetNodeIds: string[] = [];
    for (const edge of targetEdges) {
      const targetNode = graph.nodes.find((n) => n.id === edge.target);
      if (!targetNode) continue;

      const targetPtyId = targetNode.data?.ptyId;
      if (typeof targetPtyId !== "string" || !targetPtyId) continue;

      try {
        const payload = command + "\r\n";
        const bytes = Array.from(Buffer.from(payload, "utf-8"));
        pty.write(targetPtyId, bytes);
        targetNodeIds.push(edge.target);
      } catch { /* target PTY may be dead */ }
    }

    if (targetNodeIds.length > 0) {
      log.info(`[Broadcast] ${sourceNode.id} → ${targetNodeIds.length} targets: ${command}`);
      const win = getWindow();
      win?.webContents.send("pty-broadcast", {
        source: sourceNode.id,
        targets: targetNodeIds,
        command,
      });
    }
  });

  // === Swarm Dispatch Handler ===
  // When PtyService detects <<SEND_TO:...>> in PTY output, route to target terminal.
  pty.setDispatchHandler((sourcePtyId, targetLabel, command) => {
    const graph = context.getLastGraph();
    if (!graph) return;
    pty.routeToTarget(sourcePtyId, targetLabel, command, graph, getWindow());
  });

  // === Approval Handler ===
  // When PtyService detects [ASK_APPROVAL], resolve ptyId→nodeId and notify frontend.
  pty.setApprovalHandler((sourcePtyId, command) => {
    const graph = context.getLastGraph();
    let nodeLabel = "Terminal";
    let nodeId = "";

    if (graph) {
      const sourceNode = graph.nodes.find(
        (n) => n.type === "terminal" && n.data?.ptyId === sourcePtyId,
      );
      if (sourceNode) {
        nodeId = sourceNode.id;
        const label = sourceNode.data?.label;
        if (typeof label === "string") nodeLabel = label;
      }
    }

    log.info(`[HITL] Approval requested by ${nodeLabel}: ${command}`);
    const win = getWindow();
    win?.webContents.send("agent-approval-request", {
      ptyId: sourcePtyId,
      nodeId,
      nodeLabel,
      command,
    });
  });
}

import { contextBridge, ipcRenderer } from "electron";
import log from "./log";

const ALLOWED_INVOKE_CHANNELS = [
  "ping",
  "spawn_pty", "write_pty", "resize_pty", "kill_pty", "list_ptys", "read_pty_output", "pipe_pty_output", "swarm_write",
  "detect_code_server", "start_code_server", "stop_code_server", "code_server_status", "list_code_servers",
  "sync_canvas", "send_interrupt",
  "cleanup_nodes",
  "list_vault_files", "read_vault_file", "search_vault", "search_vault_content",
  "save_canvas", "load_canvas", "list_canvases", "delete_canvas",
  "get_setting", "set_setting", "get_all_settings",
  "get_secure_setting", "set_secure_setting",
  "has_master_password", "set_master_password", "verify_master_password",
  "translate_and_inject",
  "start_proxy", "stop_proxy", "list_proxies",
  "get_system_metrics",
  "approve_agent_action", "reject_agent_action",
  "fs_read_directory", "fs_read_file",
  "dialog:open",
  "persona_chat",
  "architect_chat",
  "persona_generate_dossier",
  "dialog:save",
  "fs_write_file",
  "send_notification",
  "get_app_path",
] as const;

type AllowedChannel = typeof ALLOWED_INVOKE_CHANNELS[number];

const ALLOWED_EVENT_PREFIXES = ["pty-output-", "pty-exit-", "context-injection-", "pty-broadcast", "agent-approval", "swarm-dispatch", "pty-permission-", "pty-status-"];

contextBridge.exposeInMainWorld("maestriAPI", {
  invoke: (channel: string, args?: Record<string, unknown>) => {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel as AllowedChannel)) {
      return Promise.reject(new Error(`IPC channel "${channel}" not allowed`));
    }
    return ipcRenderer.invoke(channel, args ?? {});
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_EVENT_PREFIXES.some((prefix) => channel.startsWith(prefix))) {
      log.warn(`Event channel "${channel}" not allowed`);
      return () => {};
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke("dialog:open", options),

  showSaveDialog: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke("dialog:save", options),
});

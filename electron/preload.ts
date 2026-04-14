import { contextBridge, ipcRenderer } from "electron";

const ALLOWED_INVOKE_CHANNELS = [
  "ping",
  "spawn_pty", "write_pty", "resize_pty", "kill_pty", "list_ptys", "read_pty_output", "pipe_pty_output",
  "detect_code_server", "start_code_server", "stop_code_server", "code_server_status", "list_code_servers",
  "sync_canvas", "send_interrupt",
  "cleanup_nodes",
  "list_vault_files", "read_vault_file", "search_vault", "search_vault_content",
  "save_canvas", "load_canvas", "list_canvases", "delete_canvas",
  "get_setting", "set_setting", "get_all_settings",
  "translate_and_inject",
  "start_proxy", "stop_proxy", "list_proxies",
  "get_system_metrics",
  "dialog:open",
] as const;

type AllowedChannel = typeof ALLOWED_INVOKE_CHANNELS[number];

const ALLOWED_EVENT_PREFIXES = ["pty-output-", "pty-exit-", "context-injection-"];

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (channel: string, args?: Record<string, unknown>) => {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel as AllowedChannel)) {
      return Promise.reject(new Error(`IPC channel "${channel}" not allowed`));
    }
    return ipcRenderer.invoke(channel, args ?? {});
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_EVENT_PREFIXES.some((prefix) => channel.startsWith(prefix))) {
      console.error(`Event channel "${channel}" not allowed`);
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
});

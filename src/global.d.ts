/** Typed IPC bridge exposed by preload.ts via contextBridge */
interface MaestriAPI {
  invoke: (channel: string, args?: Record<string, unknown>) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<string | null>;
}

interface Window {
  maestriAPI: MaestriAPI;
}

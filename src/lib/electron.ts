/**
 * Runtime check for Electron environment.
 * Returns false when running in a plain browser (e.g. `npm run dev` without Electron).
 */
export function isElectron(): boolean {
  return typeof window !== "undefined" && window.maestriAPI !== undefined;
}

/** Invoke an IPC command on the Electron main process. */
export async function invoke<T>(
  channel: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return window.maestriAPI.invoke(channel, args ?? {}) as Promise<T>;
}

/** Listen for events from the Electron main process. Returns a synchronous unlisten function. */
export function listen<T>(
  event: string,
  callback: (payload: T) => void,
): () => void {
  return window.maestriAPI.on(event, (payload) => callback(payload as T));
}

/** Open a native file/folder dialog. */
export async function openDialog(options: {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
}): Promise<string | null> {
  return window.maestriAPI.showOpenDialog({
    properties: [
      options.directory ? "openDirectory" : "openFile",
      ...(options.multiple ? (["multiSelections"] as const) : []),
    ],
    title: options.title,
  });
}

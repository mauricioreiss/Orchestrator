/**
 * Runtime check for Electron environment.
 * Returns false when running in a plain browser (e.g. `npm run dev` without Electron).
 */
export function isElectron(): boolean {
  return (
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI !== undefined
  );
}

/** Invoke an IPC command on the Electron main process. */
export async function invoke<T>(
  channel: string,
  args?: Record<string, unknown>,
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI.invoke(channel, args ?? {});
}

/** Listen for events from the Electron main process. Returns a synchronous unlisten function. */
export function listen<T>(
  event: string,
  callback: (payload: T) => void,
): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI.on(event, (payload: T) => callback(payload));
}

/** Open a native file/folder dialog. */
export async function openDialog(options: {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
}): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI.showOpenDialog({
    properties: [
      options.directory ? "openDirectory" : "openFile",
      ...(options.multiple ? (["multiSelections"] as const) : []),
    ],
    title: options.title,
  });
}

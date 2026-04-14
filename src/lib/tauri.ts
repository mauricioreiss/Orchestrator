/**
 * Runtime check for Tauri native environment.
 * Returns false when running in a plain browser (e.g. `npm run dev` without Tauri).
 */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ !== undefined
  );
}

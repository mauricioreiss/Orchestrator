import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";
import type { CodeServerDetection, CodeServerStatus } from "../types";

interface UseCodeServerOptions {
  instanceId: string;
  disabled?: boolean;
}

interface UseCodeServerReturn {
  detection: CodeServerDetection | null;
  status: CodeServerStatus | null;
  starting: boolean;
  error: string | null;
  start: (workspace?: string, binaryPath?: string) => Promise<void>;
  stop: () => Promise<void>;
}

const POLL_INTERVAL_MS = 1500;

export function useCodeServer({
  instanceId,
  disabled = false,
}: UseCodeServerOptions): UseCodeServerReturn {
  const [detection, setDetection] = useState<CodeServerDetection | null>(null);
  const [status, setStatus] = useState<CodeServerStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const instanceIdRef = useRef(instanceId);
  instanceIdRef.current = instanceId;

  // Detect code-server binary on mount
  useEffect(() => {
    if (disabled || !isTauri()) return;
    invoke<CodeServerDetection>("detect_code_server")
      .then(setDetection)
      .catch((e) => setError(String(e)));
  }, [disabled]);

  // Poll status (checks both process alive AND TCP readiness)
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    let deadCount = 0;
    pollRef.current = setInterval(async () => {
      try {
        const s = await invoke<CodeServerStatus>("code_server_status", {
          instanceId: instanceIdRef.current,
        });
        setStatus(s);

        if (s.running && s.ready) {
          // Server is up and accepting connections
          setStarting(false);
        } else if (!s.running) {
          deadCount++;
          if (deadCount >= 2) {
            // Process definitely dead
            setStarting(false);
            const errMsg = s.error_output
              ? `VS Code server exited: ${s.error_output.slice(0, 200)}`
              : "VS Code server exited unexpectedly. Check the workspace path.";
            setError(errMsg);
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        }
        // running but !ready → still starting, keep polling
      } catch {
        // Instance may not exist yet, keep polling
      }
    }, POLL_INTERVAL_MS);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const start = useCallback(
    async (workspace?: string, binaryPath?: string) => {
      if (disabled || !isTauri()) return;
      setError(null);
      setStarting(true);
      try {
        const s = await invoke<CodeServerStatus>("start_code_server", {
          instanceId: instanceIdRef.current,
          workspace: workspace || null,
          binaryPath: binaryPath ?? detection?.path ?? null,
        });
        setStatus(s);
        startPolling();
      } catch (e) {
        setError(String(e));
        setStarting(false);
      }
    },
    [disabled, detection, startPolling],
  );

  const stop = useCallback(async () => {
    stopPolling();
    try {
      await invoke("stop_code_server", {
        instanceId: instanceIdRef.current,
      });
      setStatus(null);
      setStarting(false);
    } catch (e) {
      setError(String(e));
    }
  }, [stopPolling]);

  // Force stop when disabled (hibernation)
  useEffect(() => {
    if (disabled) {
      stopPolling();
      if (isTauri()) {
        invoke("stop_code_server", { instanceId: instanceIdRef.current }).catch(() => {});
      }
      setStatus(null);
      setStarting(false);
    }
  }, [disabled, stopPolling]);

  // Cleanup: stop instance on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (isTauri()) {
        invoke("stop_code_server", {
          instanceId: instanceIdRef.current,
        }).catch(() => {});
      }
    };
  }, [stopPolling]);

  return { detection, status, starting, error, start, stop };
}

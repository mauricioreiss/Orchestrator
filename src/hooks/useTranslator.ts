import { useState, useCallback } from "react";
import { invoke } from "../lib/electron";
import { isElectron } from "../lib/electron";
import type { ConnectedNodeInfo, TranslateResult } from "../types";

export type TranslatorStatus = "idle" | "translating" | "success" | "error";

interface UseTranslatorReturn {
  status: TranslatorStatus;
  lastCommand: string | null;
  error: string | null;
  /**
   * Send a note's content to the backend for AI translation + direct dispatch.
   * `targets` is the full list of terminals the AI can SEND_TO (with ptyIds).
   */
  translate: (
    noteContent: string,
    targets: ConnectedNodeInfo[],
  ) => Promise<TranslateResult | null>;
}

export function useTranslator(): UseTranslatorReturn {
  const [status, setStatus] = useState<TranslatorStatus>("idle");
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const translate = useCallback(
    async (
      noteContent: string,
      targets: ConnectedNodeInfo[],
    ): Promise<TranslateResult | null> => {
      if (!isElectron()) return null;
      if (!noteContent.trim()) {
        setError("Note is empty");
        setStatus("error");
        return null;
      }

      setStatus("translating");
      setError(null);
      setLastCommand(null);

      try {
        const result = await invoke<TranslateResult>("translate_and_inject", {
          noteContent,
          connectedNodes: targets,
        });
        setLastCommand(result.command);
        setStatus("success");
        setTimeout(() => setStatus("idle"), 3000);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 5000);
        return null;
      }
    },
    [],
  );

  return { status, lastCommand, error, translate };
}

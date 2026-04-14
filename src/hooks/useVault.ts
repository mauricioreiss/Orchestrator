import { useState, useCallback } from "react";
import { invoke } from "../lib/electron";
import { isElectron } from "../lib/electron";
import type { VaultFile, VaultContent, VaultSearchResult } from "../types";

interface UseVaultOptions {
  vaultPath: string;
}

export function useVault({ vaultPath }: UseVaultOptions) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [selectedContent, setSelectedContent] = useState<VaultContent | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(
    async (subfolder?: string) => {
      if (!vaultPath || !isElectron()) return;
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<VaultFile[]>("list_vault_files", {
          vaultRoot: vaultPath,
          subfolder: subfolder ?? null,
        });
        setFiles(result);
      } catch (e) {
        setError(String(e));
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [vaultPath],
  );

  const readFile = useCallback(
    async (relativePath: string) => {
      if (!vaultPath || !isElectron()) return null;
      setError(null);
      try {
        const result = await invoke<VaultContent>("read_vault_file", {
          vaultRoot: vaultPath,
          relativePath,
        });
        setSelectedContent(result);
        return result;
      } catch (e) {
        setError(String(e));
        return null;
      }
    },
    [vaultPath],
  );

  const search = useCallback(
    async (query: string) => {
      if (!vaultPath || !query || !isElectron()) return;
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<VaultFile[]>("search_vault", {
          vaultRoot: vaultPath,
          query,
        });
        setFiles(result);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [vaultPath],
  );

  const searchContent = useCallback(
    async (query: string, maxResults?: number): Promise<VaultSearchResult[]> => {
      if (!vaultPath || query.length < 2 || !isElectron()) return [];
      setLoading(true);
      setError(null);
      try {
        return await invoke<VaultSearchResult[]>("search_vault_content", {
          vaultRoot: vaultPath,
          query,
          maxResults: maxResults ?? 20,
        });
      } catch (e) {
        setError(String(e));
        return [];
      } finally {
        setLoading(false);
      }
    },
    [vaultPath],
  );

  return {
    files,
    selectedContent,
    loading,
    error,
    loadFiles,
    readFile,
    search,
    searchContent,
  };
}

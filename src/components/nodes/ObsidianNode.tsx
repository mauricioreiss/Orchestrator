import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import type { ObsidianNodeData, VaultFile } from "../../types";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useVault } from "../../hooks/useVault";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#a855f7";
const PATH_DEBOUNCE_MS = 500;
const HANDLES = [{ type: "source" as const, position: Position.Right, color: "#a855f7" }];

function ObsidianNode({ id, data, selected }: NodeProps) {
  const nodeData = data as ObsidianNodeData;
  const label = nodeData.label ?? "Vault";

  const [path, setPath] = useState(nodeData.vaultPath ?? "");
  const [currentFolder, setCurrentFolder] = useState<string | undefined>(undefined);
  const [selectedFile, setSelectedFile] = useState<string | undefined>(nodeData.selectedFile);
  const [searchQuery, setSearchQuery] = useState("");

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { files, loading, error, loadFiles, readFile, search } = useVault({ vaultPath: path });

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, vaultPath: path } } : n,
        ),
      );
    }, PATH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [path, id, setNodes]);

  const handlePathChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { setPath(e.target.value); }, []);

  const handleLoad = useCallback(() => {
    if (path) { setCurrentFolder(undefined); loadFiles(); }
  }, [path, loadFiles]);

  const handleFileClick = useCallback(
    async (file: VaultFile) => {
      if (file.is_dir) { setCurrentFolder(file.relative_path); loadFiles(file.relative_path); return; }
      setSelectedFile(file.relative_path);
      const content = await readFile(file.relative_path);
      if (content) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, selectedFile: file.relative_path, content: content.content } } : n,
          ),
        );
        syncDebounced();
      }
    },
    [id, readFile, setNodes, syncDebounced, loadFiles],
  );

  const handleBack = useCallback(() => {
    if (!currentFolder) return;
    const parent = currentFolder.includes("/")
      ? currentFolder.substring(0, currentFolder.lastIndexOf("/"))
      : undefined;
    setCurrentFolder(parent);
    loadFiles(parent);
  }, [currentFolder, loadFiles]);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSearchQuery(q);
      if (q.length >= 2) search(q);
      else if (q.length === 0) loadFiles(currentFolder);
    },
    [search, loadFiles, currentFolder],
  );

  const hasFiles = files.length > 0;
  const isLoaded = hasFiles || (path && !loading && !error);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  const noteCount = files.filter((f) => !f.is_dir).length;

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={BORDER_COLOR}
      minWidth={350}
      minHeight={250}
      label={label}
      badges={
        <>
          {hasFiles && <span className="text-[10px]" style={{ color: "var(--mx-text-muted)" }}>{noteCount} notes</span>}
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-purple-500/20 text-purple-400 border-purple-500/30">vault</span>
        </>
      }
      statusLeft={selectedFile ?? "no file selected"}
      statusRight={<span style={{ color: "rgba(168,85,247,0.6)" }}>obsidian</span>}
      handles={HANDLES}
    >
      <div className="flex-1 flex flex-col min-h-0 p-2 gap-2">
        {/* Path input */}
        <div className="flex gap-1.5">
          <input
            type="text"
            className="flex-1 text-xs px-2 py-1.5 rounded border outline-none nodrag"
            style={{
              background: "var(--mx-input-bg)",
              borderColor: "var(--mx-input-border)",
              color: "var(--mx-text)",
            }}
            value={path}
            onChange={handlePathChange}
            placeholder="C:\Users\mauri\ObsidianVault"
            spellCheck={false}
          />
          <button
            onClick={handleLoad}
            disabled={!path || loading}
            className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#313244] disabled:text-[#6c7086] text-white text-xs font-medium rounded transition-colors nodrag"
          >
            {loading ? "..." : "Load"}
          </button>
        </div>

        {/* Search */}
        {isLoaded && (
          <input
            type="text"
            className="w-full text-xs px-2 py-1 rounded border outline-none nodrag"
            style={{
              background: "var(--mx-input-bg)",
              borderColor: "var(--mx-input-border)",
              color: "var(--mx-text)",
            }}
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Search notes..."
            spellCheck={false}
          />
        )}

        {/* Breadcrumb */}
        {currentFolder && (
          <button onClick={handleBack} className="text-left text-[10px] text-purple-400 hover:text-purple-300 transition-colors nodrag">
            &larr; {currentFolder}
          </button>
        )}

        {/* Error */}
        {error && <p className="text-[11px] text-red-400 truncate" title={error}>{error}</p>}

        {/* File list */}
        {hasFiles && (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 nodrag nowheel">
            {files.map((file) => (
              <button
                key={file.relative_path}
                onClick={() => handleFileClick(file)}
                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                  selectedFile === file.relative_path
                    ? "bg-purple-500/20 text-purple-300"
                    : "hover:bg-[#313244]/50"
                }`}
                style={{ color: selectedFile === file.relative_path ? undefined : "var(--mx-text)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{file.is_dir ? "\uD83D\uDCC1 " : ""}{file.name}</span>
                  {!file.is_dir && (
                    <span className="text-[9px] ml-2 shrink-0" style={{ color: "var(--mx-text-muted)" }}>
                      {formatSize(file.size)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

export default memo(ObsidianNode);

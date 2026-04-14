import { memo, useState, useCallback, useRef, useEffect } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import type { ObsidianNodeData, VaultFile } from "../../types";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useVault } from "../../hooks/useVault";

const BORDER_COLOR = "#a855f7";
const PATH_DEBOUNCE_MS = 500;

function ObsidianNode({ id, data, selected }: NodeProps) {
  const nodeData = data as ObsidianNodeData;
  const label = nodeData.label ?? "Vault";

  const [path, setPath] = useState(nodeData.vaultPath ?? "");
  const [currentFolder, setCurrentFolder] = useState<string | undefined>(
    undefined,
  );
  const [selectedFile, setSelectedFile] = useState<string | undefined>(
    nodeData.selectedFile,
  );
  const [searchQuery, setSearchQuery] = useState("");

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { files, loading, error, loadFiles, readFile, search } = useVault({
    vaultPath: path,
  });

  // Propagate path changes to React Flow node data (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, vaultPath: path } } : n,
        ),
      );
    }, PATH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [path, id, setNodes]);

  const handlePathChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPath(e.target.value);
    },
    [],
  );

  const handleLoad = useCallback(() => {
    if (path) {
      setCurrentFolder(undefined);
      loadFiles();
    }
  }, [path, loadFiles]);

  const handleFileClick = useCallback(
    async (file: VaultFile) => {
      if (file.is_dir) {
        setCurrentFolder(file.relative_path);
        loadFiles(file.relative_path);
        return;
      }

      setSelectedFile(file.relative_path);
      const content = await readFile(file.relative_path);
      if (content) {
        // Push content to node data so ContextManager can dispatch to terminals
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    selectedFile: file.relative_path,
                    content: content.content,
                  },
                }
              : n,
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
      if (q.length >= 2) {
        search(q);
      } else if (q.length === 0) {
        loadFiles(currentFolder);
      }
    },
    [search, loadFiles, currentFolder],
  );

  const hasFiles = files.length > 0;
  const isLoaded = hasFiles || (path && !loading && !error);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={350}
        minHeight={250}
        lineStyle={{ borderColor: BORDER_COLOR }}
        handleStyle={{
          width: 10,
          height: 10,
          backgroundColor: BORDER_COLOR,
          borderColor: BORDER_COLOR,
        }}
      />

      <div
        className="flex flex-col h-full rounded-lg overflow-hidden shadow-2xl"
        style={{
          border: `1px solid ${selected ? BORDER_COLOR : "rgba(49,50,68,0.5)"}`,
          background: "rgba(24,24,37,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: selected
            ? `0 0 20px ${BORDER_COLOR}33, 0 8px 32px rgba(0,0,0,0.3)`
            : "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b]/80 border-b border-[#313244]/50 select-none cursor-grab active:cursor-grabbing">
          <span className="text-sm font-medium text-[#cdd6f4] truncate max-w-[200px]">
            {label}
          </span>
          <div className="flex items-center gap-2">
            {hasFiles && (
              <span className="text-[10px] text-[#6c7086]">
                {files.filter((f) => !f.is_dir).length} notes
              </span>
            )}
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-purple-500/20 text-purple-400 border-purple-500/30">
              vault
            </span>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col min-h-0 p-2 gap-2">
          {/* Path input row */}
          <div className="flex gap-1.5">
            <input
              type="text"
              className="flex-1 bg-[#11111b]/80 text-[#cdd6f4] text-xs px-2 py-1.5 rounded border border-[#313244]/50 outline-none focus:border-purple-500/50 placeholder-[#6c7086] nodrag"
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
              className="w-full bg-[#11111b]/80 text-[#cdd6f4] text-xs px-2 py-1 rounded border border-[#313244]/50 outline-none focus:border-purple-500/50 placeholder-[#6c7086] nodrag"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search notes..."
              spellCheck={false}
            />
          )}

          {/* Navigation breadcrumb */}
          {currentFolder && (
            <button
              onClick={handleBack}
              className="text-left text-[10px] text-purple-400 hover:text-purple-300 transition-colors nodrag"
            >
              &larr; {currentFolder}
            </button>
          )}

          {/* Error */}
          {error && (
            <p className="text-[11px] text-red-400 truncate" title={error}>
              {error}
            </p>
          )}

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
                      : "text-[#cdd6f4] hover:bg-[#313244]/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">
                      {file.is_dir ? "📁 " : ""}
                      {file.name}
                    </span>
                    {!file.is_dir && (
                      <span className="text-[9px] text-[#6c7086] ml-2 shrink-0">
                        {formatSize(file.size)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-[#11111b]/80 border-t border-[#313244]/50 select-none">
          <span className="text-[10px] text-[#6c7086] truncate max-w-[250px]">
            {selectedFile ?? "no file selected"}
          </span>
          <span className="text-[10px] text-purple-400/60">obsidian</span>
        </div>
      </div>

      {/* Source handle: connects TO terminals */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-[#181825]"
      />
    </>
  );
}

export default memo(ObsidianNode);

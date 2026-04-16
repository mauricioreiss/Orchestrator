import { memo, useState, useCallback, useEffect } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import Editor from "@monaco-editor/react";
import { invoke, openDialog, isElectron } from "../../lib/electron";
import { useTheme } from "../../contexts/ThemeContext";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import { useShallow } from "zustand/react/shallow";
import NodeWrapper from "./NodeWrapper";
import FileIcon from "../FileIcon";
import type { WorkspaceNodeData, FsEntry, FsFileContent } from "../../types";

const BORDER_COLOR = "#14b8a6";
const HANDLES = [
  { id: "top", type: "target" as const, position: Position.Top, color: "#14b8a6" },
  { id: "bottom", type: "source" as const, position: Position.Bottom, color: "#14b8a6" },
  { id: "left", type: "target" as const, position: Position.Left, color: "#14b8a6" },
  { id: "right", type: "source" as const, position: Position.Right, color: "#14b8a6" },
];

function TreeItem({
  entry,
  rootDir,
  depth,
  onFileSelect,
}: {
  entry: FsEntry;
  rootDir: string;
  depth: number;
  onFileSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FsEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    if (!entry.is_dir) {
      onFileSelect(entry.relative_path);
      return;
    }

    if (expanded) {
      setExpanded(false);
      return;
    }

    if (children === null) {
      setLoading(true);
      try {
        const result = await invoke<FsEntry[]>("fs_read_directory", {
          rootDir,
          subfolder: entry.relative_path,
        });
        setChildren(result);
      } catch {
        setChildren([]);
      }
      setLoading(false);
    }

    setExpanded(true);
  }, [entry, rootDir, expanded, children, onFileSelect]);

  return (
    <div>
      <button
        className="flex items-center gap-1 w-full text-left py-0.5 rounded transition-colors"
        style={{ paddingLeft: `${4 + depth * 12}px`, paddingRight: 4 }}
        onClick={toggle}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-sidebar-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {entry.is_dir ? (
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            className="shrink-0 transition-transform"
            style={{
              color: "var(--mx-text-muted)",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div className="w-2.5 shrink-0" />
        )}
        <span className="shrink-0 flex items-center justify-center">
          <FileIcon name={entry.name} isDir={entry.is_dir} isOpen={expanded} size={13} />
        </span>
        <span className="text-[10px] truncate" style={{ color: "var(--mx-text-secondary)" }}>
          {entry.name}
        </span>
        {loading && (
          <div
            className="w-2.5 h-2.5 border border-current rounded-full animate-spin shrink-0 ml-auto"
            style={{ borderTopColor: "transparent", color: "var(--mx-text-muted)" }}
          />
        )}
      </button>

      {expanded && children && children.map((child) => (
        <TreeItem
          key={child.relative_path}
          entry={child}
          rootDir={rootDir}
          depth={depth + 1}
          onFileSelect={onFileSelect}
        />
      ))}
    </div>
  );
}

function NativeWorkspaceNodeInner({ id, data, selected, parentId }: NodeProps) {
  const { theme } = useTheme();
  const nodeData = data as WorkspaceNodeData;
  const label = nodeData.label ?? "Workspace";

  const hibernatedGroups = useCanvasStore(useShallow((s) => s.hibernatedGroups));
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const [rootDir, setRootDir] = useState<string | null>(nodeData.path || null);
  const [rootEntries, setRootEntries] = useState<FsEntry[]>([]);
  const [loadingRoot, setLoadingRoot] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLanguage, setFileLanguage] = useState("plaintext");
  const [loadingFile, setLoadingFile] = useState(false);

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  const loadDirectory = useCallback(async (dir: string) => {
    if (!isElectron()) return;
    setLoadingRoot(true);
    try {
      const entries = await invoke<FsEntry[]>("fs_read_directory", { rootDir: dir });
      setRootEntries(entries);
    } catch {
      setRootEntries([]);
    }
    setLoadingRoot(false);
  }, []);

  const handleOpenFolder = useCallback(async () => {
    if (!isElectron()) return;
    const selected = await openDialog({ directory: true, title: "Open Project Folder" });
    if (!selected) return;
    setRootDir(selected);
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, path: selected } } : n)),
    );
    syncDebounced();
    loadDirectory(selected);
  }, [id, setNodes, syncDebounced, loadDirectory]);

  // Load on mount if path exists
  useEffect(() => {
    if (rootDir && isElectron()) loadDirectory(rootDir);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // React to external path changes (Smart Context: terminal -> workspace injects cwd)
  useEffect(() => {
    if (nodeData.path && nodeData.path !== rootDir) {
      setRootDir(nodeData.path);
      loadDirectory(nodeData.path);
    }
  }, [nodeData.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = useCallback(async (relativePath: string) => {
    if (!rootDir || !isElectron()) return;
    setActiveFile(relativePath);
    setLoadingFile(true);
    try {
      const result = await invoke<FsFileContent>("fs_read_file", { rootDir, relativePath });
      setFileContent(result.content);
      setFileLanguage(result.language || "plaintext");
    } catch {
      setFileContent("// Error reading file");
      setFileLanguage("plaintext");
    }
    setLoadingFile(false);
  }, [rootDir]);

  const fileName = activeFile?.split(/[\\/]/).pop() ?? null;
  const folderName = rootDir?.split(/[\\/]/).pop() ?? null;

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id}
        selected={selected}
        borderColor={BORDER_COLOR}
        minWidth={600}
        minHeight={400}
        label={label}
        badges={
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-teal-500/20 text-teal-400 border-teal-500/30">
            sleep
          </span>
        }
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm" style={{ color: "var(--mx-text-muted)" }}>Hibernated</span>
        </div>
      </NodeWrapper>
    );
  }

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={BORDER_COLOR}
      minWidth={600}
      minHeight={400}
      label={label}
      badges={
        <span
          className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
            rootDir
              ? "bg-teal-500/20 text-teal-400 border-teal-500/30"
              : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
          }`}
        >
          {rootDir ? "open" : "empty"}
        </span>
      }
      statusLeft={folderName ?? "no folder"}
      statusRight={<span style={{ color: "rgba(20,184,166,0.6)" }}>workspace</span>}
      handles={HANDLES}
    >
      <div className="flex-1 flex min-h-0 nodrag nowheel">
        {/* File Tree Panel */}
        {!treeCollapsed && (
          <div
            className="flex flex-col min-h-0 overflow-hidden shrink-0"
            style={{ width: 200, borderRight: "1px solid var(--mx-border)" }}
          >
            {/* Tree header */}
            <div
              className="flex items-center justify-between px-2 py-1.5 shrink-0"
              style={{ borderBottom: "1px solid var(--mx-border)" }}
            >
              <span
                className="text-[10px] font-semibold truncate uppercase tracking-wider"
                style={{ color: "var(--mx-text-muted)" }}
              >
                {folderName ?? "Explorer"}
              </span>
              <button
                onClick={handleOpenFolder}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors"
                style={{ color: "var(--mx-text-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#14b8a6")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mx-text-muted)")}
                title="Open folder"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M1.5 3.5V11a1 1 0 001 1h9a1 1 0 001-1V5.5a1 1 0 00-1-1H7L5.5 3H2.5a1 1 0 00-1 .5z"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            {/* Tree body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-0.5">
              {loadingRoot && (
                <div className="flex items-center justify-center py-6">
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: "#14b8a6", borderTopColor: "transparent" }}
                  />
                </div>
              )}

              {!loadingRoot && rootEntries.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 px-2">
                  <svg width="24" height="24" viewBox="0 0 32 32" fill="none" style={{ color: "var(--mx-text-muted)" }}>
                    <path
                      d="M4 8V26a2 2 0 002 2h20a2 2 0 002-2V12a2 2 0 00-2-2H15l-3-4H6a2 2 0 00-2 2z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <button
                    onClick={handleOpenFolder}
                    className="text-[10px] font-medium px-2 py-1 rounded transition-colors"
                    style={{ color: "#14b8a6", background: "rgba(20,184,166,0.1)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(20,184,166,0.2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(20,184,166,0.1)")}
                  >
                    Open Folder
                  </button>
                </div>
              )}

              {!loadingRoot &&
                rootDir &&
                rootEntries.map((entry) => (
                  <TreeItem
                    key={entry.relative_path}
                    entry={entry}
                    rootDir={rootDir}
                    depth={0}
                    onFileSelect={handleFileSelect}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          className="w-4 shrink-0 flex items-center justify-center transition-colors"
          style={{ background: "var(--mx-input-bg)", color: "var(--mx-text-muted)" }}
          onClick={() => setTreeCollapsed(!treeCollapsed)}
          title={treeCollapsed ? "Show file tree" : "Hide file tree"}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#14b8a6")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mx-text-muted)")}
        >
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
            <path
              d={treeCollapsed ? "M2 2l4 4-4 4" : "M6 2L2 6l4 4"}
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Monaco Editor Panel */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* File tab */}
          {fileName && (
            <div
              className="flex items-center gap-2 px-2 py-1 shrink-0"
              style={{ borderBottom: "1px solid var(--mx-border)" }}
            >
              <FileIcon name={fileName} isDir={false} size={13} />
              <span
                className="text-[10px] font-mono truncate"
                style={{ color: "var(--mx-text-secondary)" }}
              >
                {fileName}
              </span>
            </div>
          )}

          {/* Editor or empty state */}
          {loadingFile ? (
            <div className="flex-1 flex items-center justify-center">
              <div
                className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: "#14b8a6", borderTopColor: "transparent" }}
              />
            </div>
          ) : fileContent !== null ? (
            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                language={fileLanguage}
                theme={theme === "dark" ? "vs-dark" : "vs"}
                value={fileContent}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono Variable', monospace",
                  lineNumbers: "on",
                  renderLineHighlight: "none",
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                  padding: { top: 4 },
                  wordWrap: "off",
                }}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[11px]" style={{ color: "var(--mx-text-muted)" }}>
                Select a file to view
              </span>
            </div>
          )}
        </div>
      </div>
    </NodeWrapper>
  );
}

const NativeWorkspaceNode = memo(NativeWorkspaceNodeInner);
export default NativeWorkspaceNode;

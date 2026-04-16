import { useState, useCallback } from "react";
import { invoke, openDialog, isElectron } from "../lib/electron";
import { useCanvasStore } from "../store/canvasStore";
import FileIcon from "./FileIcon";
import type { FsEntry } from "../types";

interface FileExplorerProps {
  open: boolean;
  onClose: () => void;
}

interface TreeNodeProps {
  entry: FsEntry;
  rootDir: string;
  depth: number;
}

function TreeNode({ entry, rootDir, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FsEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    if (!entry.is_dir) return;

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
      } catch (err) {
        console.error("[FileExplorer] readDirectory failed:", err);
        setChildren([]);
      }
      setLoading(false);
    }

    setExpanded(true);
  }, [entry, rootDir, expanded, children]);

  const handleDoubleClick = useCallback(() => {
    if (entry.is_dir) return;
    // Build absolute file path
    const normalizedRoot = rootDir.replace(/\\/g, "/").replace(/\/$/, "");
    const absolutePath = `${normalizedRoot}/${entry.relative_path}`;
    useCanvasStore.getState().addMonacoNode(absolutePath, rootDir);
  }, [entry, rootDir]);

  const isDir = entry.is_dir;

  return (
    <div>
      <button
        className="flex items-center gap-1.5 w-full text-left py-0.5 rounded transition-colors group"
        style={{
          paddingLeft: `${8 + depth * 14}px`,
          paddingRight: 8,
        }}
        onClick={toggle}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-sidebar-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {/* Expand chevron or spacer */}
        {isDir ? (
          <svg
            width="12"
            height="12"
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
          <div className="w-3 shrink-0" />
        )}

        {/* Icon */}
        <span className="shrink-0 flex items-center justify-center">
          <FileIcon name={entry.name} isDir={isDir} isOpen={expanded} />
        </span>

        {/* Name */}
        <span
          className="text-[11px] truncate"
          style={{ color: "var(--mx-text-secondary)" }}
        >
          {entry.name}
        </span>

        {loading && (
          <div
            className="w-3 h-3 border border-current rounded-full animate-spin shrink-0 ml-auto"
            style={{ borderTopColor: "transparent", color: "var(--mx-text-muted)" }}
          />
        )}
      </button>

      {/* Children */}
      {expanded && children && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.relative_path}
              entry={child}
              rootDir={rootDir}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {expanded && children && children.length === 0 && (
        <div
          className="text-[10px] italic py-0.5"
          style={{ paddingLeft: `${8 + (depth + 1) * 14}px`, color: "var(--mx-text-muted)" }}
        >
          Empty
        </div>
      )}
    </div>
  );
}

export default function FileExplorer({ open, onClose }: FileExplorerProps) {
  const [rootDir, setRootDir] = useState<string | null>(null);
  const [rootEntries, setRootEntries] = useState<FsEntry[]>([]);
  const [loadingRoot, setLoadingRoot] = useState(false);

  const handleOpenFolder = useCallback(async () => {
    if (!isElectron()) return;

    const selected = await openDialog({ directory: true, title: "Open Project Folder" });
    if (!selected) return;

    setRootDir(selected);
    setLoadingRoot(true);
    try {
      const entries = await invoke<FsEntry[]>("fs_read_directory", { rootDir: selected });
      setRootEntries(entries);
    } catch (err) {
      console.error("[FileExplorer] open folder failed:", err);
      setRootEntries([]);
    }
    setLoadingRoot(false);
  }, []);

  if (!open) return null;

  const folderName = rootDir ? rootDir.split(/[\\/]/).pop() ?? rootDir : null;

  return (
    <div
      className="fixed right-0 top-0 h-full z-50 flex flex-col select-none"
      style={{
        width: 260,
        background: "var(--mx-glass-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderLeft: "1px solid var(--mx-glass-border)",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.2)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--mx-border)" }}
      >
        <span className="text-xs font-semibold" style={{ color: "var(--mx-text)" }}>
          Explorer
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{ color: "var(--mx-text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(239,68,68,0.15)";
            e.currentTarget.style.color = "#ef4444";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--mx-text-muted)";
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Open folder button */}
      <div className="px-3 py-2 shrink-0">
        <button
          onClick={handleOpenFolder}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          style={{
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            color: "#6366f1",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.25)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.15)")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1.5 3.5V11a1 1 0 001 1h9a1 1 0 001-1V5.5a1 1 0 00-1-1H7L5.5 3H2.5a1 1 0 00-1 .5z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Open Folder
        </button>
      </div>

      {/* Current folder */}
      {folderName && (
        <div
          className="px-3 py-1 text-[10px] font-mono truncate shrink-0"
          style={{ color: "var(--mx-text-muted)", borderBottom: "1px solid var(--mx-border)" }}
          title={rootDir ?? undefined}
        >
          {folderName}
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {loadingRoot && (
          <div className="flex items-center justify-center py-8">
            <div
              className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: "#6366f1", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {!loadingRoot && rootEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ color: "var(--mx-text-muted)" }}>
              <path d="M4 8V26a2 2 0 002 2h20a2 2 0 002-2V12a2 2 0 00-2-2H15l-3-4H6a2 2 0 00-2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[11px]" style={{ color: "var(--mx-text-muted)" }}>
              Open a folder to browse files
            </span>
          </div>
        )}

        {!loadingRoot && rootDir && rootEntries.map((entry) => (
          <TreeNode
            key={entry.relative_path}
            entry={entry}
            rootDir={rootDir}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}

import { memo, useState, useEffect } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import Editor from "@monaco-editor/react";
import NodeWrapper from "./NodeWrapper";
import type { HandleConfig } from "./NodeWrapper";
import { useTheme } from "../../contexts/ThemeContext";
import { invoke, isElectron } from "../../lib/electron";
import type { MonacoNodeData, FsFileContent } from "../../types";

const HANDLES: HandleConfig[] = [
  { id: "top", type: "target", position: Position.Top },
  { id: "bottom", type: "source", position: Position.Bottom },
  { id: "left", type: "target", position: Position.Left },
  { id: "right", type: "source", position: Position.Right },
];

function MonacoNodeInner({ id, data, selected }: NodeProps) {
  const { theme } = useTheme();
  const { filePath, rootDir, language, label } = data as MonacoNodeData;

  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isElectron() || !filePath || !rootDir) {
      setLoading(false);
      return;
    }

    // Compute relative path from rootDir
    let relativePath = filePath;
    const normalizedRoot = rootDir.replace(/\\/g, "/");
    const normalizedFile = filePath.replace(/\\/g, "/");
    if (normalizedFile.startsWith(normalizedRoot)) {
      relativePath = normalizedFile.slice(normalizedRoot.length).replace(/^\//, "");
    }

    setLoading(true);
    setError(null);

    invoke<FsFileContent>("fs_read_file", { rootDir, relativePath })
      .then((result) => {
        setContent(result.content);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [filePath, rootDir]);

  return (
    <NodeWrapper
      id={id}
      label={label ?? "Editor"}
      borderColor="#6366f1"
      selected={selected}
      handles={HANDLES}
    >
      <div className="nodrag nowheel w-full h-full" style={{ minHeight: 200 }}>
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div
              className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: "#6366f1", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full px-4 text-xs text-red-400 text-center">
            {error}
          </div>
        )}

        {!loading && !error && (
          <Editor
            height="100%"
            language={language ?? "plaintext"}
            theme={theme === "dark" ? "vs-dark" : "vs"}
            value={content ?? ""}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              fontFamily: "'JetBrains Mono Variable', monospace",
              lineNumbers: "on",
              renderLineHighlight: "none",
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
              padding: { top: 8 },
              wordWrap: "off",
            }}
          />
        )}
      </div>
    </NodeWrapper>
  );
}

const MonacoNode = memo(MonacoNodeInner);
export default MonacoNode;

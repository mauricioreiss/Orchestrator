import { memo, useState, useCallback, useRef, useEffect } from "react";
import {
  Position,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import type { NoteNodeData, TerminalNodeData, VSCodeNodeData, ConnectedNodeInfo } from "../../types";
import { isElectron } from "../../lib/electron";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import { useTranslator } from "../../hooks/useTranslator";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#f59e0b";
const CONTENT_DEBOUNCE_MS = 300;

type ExecStatus = "idle" | "sending" | "success" | "error";

function NoteNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NoteNodeData;
  const label = nodeData.label ?? "Note";
  const priority = nodeData.priority ?? 1;
  const commandMode = nodeData.commandMode ?? false;

  const [content, setContent] = useState(nodeData.content ?? "");
  const [execStatus, setExecStatus] = useState<ExecStatus>("idle");
  const [execError, setExecError] = useState<string | null>(null);
  const { setNodes, getNode, getEdges } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
  const setEdges = useCanvasStore((s) => s.setEdges);
  const { translate } = useTranslator();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Propagate content changes to React Flow node data (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, content } } : n,
        ),
      );
      syncDebounced();
    }, CONTENT_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, id, setNodes, syncDebounced]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
    },
    [],
  );

  const toggleCommandMode = useCallback(() => {
    const newMode = !commandMode;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, commandMode: newMode } }
          : n,
      ),
    );
    syncDebounced();
  }, [id, commandMode, setNodes, syncDebounced]);

  const setEdgeStatus = useCallback(
    (edgeStatus: string) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.source === id || e.target === id
            ? { ...e, data: { ...e.data, status: edgeStatus } }
            : e,
        ),
      );
    },
    [id, setEdges],
  );

  const handleExecute = useCallback(async () => {
    const trimmed = content.trim();
    console.log("[NoteNode] 1. EXECUTE clicado. Texto:", trimmed);

    if (trimmed.length === 0) {
      console.warn("[NoteNode] Nota vazia, abortando.");
      setExecStatus("error");
      setExecError("Nota vazia");
      setTimeout(() => { setExecStatus("idle"); setExecError(null); }, 2500);
      return;
    }

    if (!isElectron()) {
      console.warn("[NoteNode] Não está rodando em Electron — invoke indisponível.");
      setExecStatus("error");
      setExecError("Electron API indisponível");
      setTimeout(() => { setExecStatus("idle"); setExecError(null); }, 2500);
      return;
    }

    // Bidirectional: find ANY edge touching this note, regardless of draw direction.
    const connected = getEdges().filter((e) => e.source === id || e.target === id);
    console.log(`[NoteNode] 2. Arestas conectadas (bidirecional): ${connected.length}`, connected);

    if (connected.length === 0) {
      console.warn("[NoteNode] Nenhuma aresta conectada — conecte a nota a um terminal orquestrador.");
      setExecStatus("error");
      setExecError("Conecte a nota a um terminal");
      setTimeout(() => { setExecStatus("idle"); setExecError(null); }, 2500);
      return;
    }

    // Resolve neighbor nodes on the other side of each edge.
    const targets = connected
      .map((e) => getNode(e.source === id ? e.target : e.source))
      .filter((n): n is NonNullable<typeof n> => !!n);

    // ALL connected terminals — no orchestrator election. The backend is
    // the brain: it calls the AI and dispatches directly to each PTY.
    const allTerminals: ConnectedNodeInfo[] = targets
      .filter((n) => n.type === "terminal")
      .map((n) => {
        const d = n.data as TerminalNodeData;
        return {
          label: d.label ?? "Terminal",
          type: "terminal",
          cwd: d.cwd,
          ptyId: d.ptyId,
        };
      })
      .filter((info) => !!info.ptyId);

    // Multi-hop: Note → VSCode → Terminal
    const connectedVSCodes = targets.filter((n) => n.type === "vscode");
    for (const vsc of connectedVSCodes) {
      const vscData = vsc.data as VSCodeNodeData;
      const vscPath = vscData.workspacePath;
      const vscEdges = getEdges().filter(
        (e) => e.source === vsc.id || e.target === vsc.id,
      );
      for (const ve of vscEdges) {
        const neighborId = ve.source === vsc.id ? ve.target : ve.source;
        if (neighborId === id) continue;
        const neighbor = getNode(neighborId);
        if (!neighbor || neighbor.type !== "terminal") continue;
        const td = neighbor.data as TerminalNodeData;
        if (!td.ptyId) continue;
        if (allTerminals.some((t) => t.ptyId === td.ptyId)) continue;
        allTerminals.push({
          label: td.label ?? "Terminal",
          type: "terminal",
          cwd: td.cwd || vscPath,
          ptyId: td.ptyId,
        });
      }
    }

    console.log("[NoteNode] 3. Terminais conectados:", allTerminals.map((t) => t.label));

    if (allTerminals.length === 0) {
      console.warn("[NoteNode] Nenhum terminal ativo entre os vizinhos.");
      setExecStatus("error");
      setExecError("Nenhum terminal ativo");
      setTimeout(() => { setExecStatus("idle"); setExecError(null); }, 2500);
      return;
    }

    setExecStatus("sending");
    setExecError(null);
    setEdgeStatus("translating");

    console.log(`[NoteNode] 4. Chamando translate_and_inject com ${allTerminals.length} terminais`);
    try {
      const result = await translate(trimmed, allTerminals);

      if (result) {
        console.log(`[NoteNode] 5. Tradução OK (${result.provider}/${result.model}):`, result.command);
        setExecStatus("success");
        setEdgeStatus("success");
      } else {
        console.error("[NoteNode] 5. translate() retornou null.");
        setExecStatus("error");
        setExecError("Tradução falhou");
        setEdgeStatus("error");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[NoteNode] 5. translate() lançou exceção:", msg);
      setExecStatus("error");
      setExecError(msg);
      setEdgeStatus("error");
    }

    setTimeout(() => {
      setExecStatus("idle");
      setEdgeStatus("idle");
    }, 2500);
  }, [id, getEdges, getNode, content, setEdgeStatus, translate]);

  const borderColor = commandMode ? "#A855F7" : BORDER_COLOR;

  const modeBadge = (
    <button
      onClick={toggleCommandMode}
      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border transition-colors nodrag ${
        commandMode
          ? "bg-violet-500/30 text-violet-300 border-violet-500/50"
          : "bg-amber-500/20 text-amber-400 border-amber-500/30"
      }`}
      title={commandMode ? "Command mode (send directly)" : "Text mode (context note)"}
    >
      {commandMode ? "CMD" : "TXT"}
    </button>
  );

  const priorityBadge = (
    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-amber-500/20 text-amber-400 border-amber-500/30">
      P{priority}
    </span>
  );

  return (
    <NodeWrapper
      id={id}
      selected={selected}
      borderColor={borderColor}
      minWidth={300}
      minHeight={200}
      label={label}
      badges={<>{modeBadge}{priorityBadge}</>}
      statusLeft={`${content.length} chars`}
      statusRight={
        <span style={{ color: commandMode ? "#a78bfa" : "#fbbf24", opacity: 0.6 }}>
          {commandMode ? "command" : "note"}
        </span>
      }
      handles={[
        { id: "top", type: "target", position: Position.Top, color: commandMode ? "#A855F7" : "#f59e0b" },
        { id: "bottom", type: "source", position: Position.Bottom, color: commandMode ? "#A855F7" : "#f59e0b" },
        { id: "left", type: "target", position: Position.Left, color: commandMode ? "#A855F7" : "#f59e0b" },
        { id: "right", type: "source", position: Position.Right, color: commandMode ? "#A855F7" : "#f59e0b" },
      ]}
    >
      {/* Content area */}
      <textarea
        className="flex-1 min-h-0 w-full bg-transparent text-sm p-3 resize-none outline-none nodrag nowheel"
        style={{ color: "var(--mx-text)" }}
        value={content}
        onChange={handleChange}
        placeholder={
          commandMode
            ? "Type a command to execute in the terminal..."
            : "System instruction for connected terminals..."
        }
        spellCheck={false}
      />

      {/* Execute button (command mode only) */}
      {commandMode && (
        <div className="px-3 py-2" style={{ borderTop: "1px solid var(--mx-border)" }}>
          <button
            onClick={handleExecute}
            disabled={execStatus === "sending" || !content.trim()}
            className={`w-full py-1.5 rounded text-sm font-semibold transition-all nodrag ${
              execStatus === "sending"
                ? "bg-violet-500/20 text-violet-300 cursor-wait"
                : execStatus === "error"
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : execStatus === "success"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-violet-500/30 text-violet-300 hover:bg-violet-500/40 active:bg-violet-500/50"
            }`}
          >
            {getStatusLabel(execStatus)}
          </button>
          {execError && execStatus === "error" && (
            <div
              className="mt-1.5 px-2 py-1 rounded text-[10px] text-red-400 truncate"
              style={{ background: "var(--mx-input-bg)" }}
            >
              {execError}
            </div>
          )}
        </div>
      )}
    </NodeWrapper>
  );
}

function getStatusLabel(status: ExecStatus): string {
  switch (status) {
    case "sending":
      return "Sending...";
    case "success":
      return "Sent";
    case "error":
      return "Error - Retry";
    default:
      return "EXECUTE";
  }
}

export default memo(NoteNode);

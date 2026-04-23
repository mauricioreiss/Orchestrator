import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { toast } from "sonner";
import { invoke, isElectron } from "../../lib/electron";
import { useCanvasSync } from "../../hooks/useCanvasSync";
import { useCanvasStore } from "../../store/canvasStore";
import { useShallow } from "zustand/react/shallow";
import type { ArchitectNodeData, ChatMessage, PersonaFile } from "../../types";
import NodeWrapper from "./NodeWrapper";

const BORDER_COLOR = "#8b5cf6";
const HANDLES = [
  { id: "top", type: "target" as const, position: Position.Top, color: "#8b5cf6" },
  { id: "bottom", type: "source" as const, position: Position.Bottom, color: "#8b5cf6" },
  { id: "left", type: "target" as const, position: Position.Left, color: "#8b5cf6" },
  { id: "right", type: "source" as const, position: Position.Right, color: "#8b5cf6" },
];

const FILE_TAG_RE = /<file\s+name="([^"]+)">([\s\S]*?)<\/file>/g;

function extractPersonaFiles(text: string): PersonaFile[] {
  const files: PersonaFile[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(FILE_TAG_RE.source, FILE_TAG_RE.flags);
  while ((match = re.exec(text)) !== null) {
    const name = match[1].trim();
    const content = match[2].trim();
    if (name && content) files.push({ name, content });
  }
  return files;
}

function stripFileMarkers(text: string): string {
  return text
    .replace(/<file\s+name="([^"]*)">\s*[\s\S]*?<\/file>/g, (_m, name) => `[Persona: ${name}]`)
    .trim();
}

function buildIgnitionCmd(fileName: string): string {
  return `Leia o arquivo ${fileName} na raiz do projeto. Assuma essa persona e aguarde minhas ordens.`;
}

function ArchitectNode({ id, data, selected, parentId }: NodeProps) {
  const nodeData = data as ArchitectNodeData;
  const label = nodeData.label ?? "Architect";
  const cwd = nodeData.cwd ?? "";

  const hibernatedGroups = useCanvasStore(useShallow((s) => s.hibernatedGroups));
  const isHibernated = parentId ? hibernatedGroups.includes(parentId as string) : false;

  const { setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  const [messages, setMessages] = useState<ChatMessage[]>(nodeData.messages ?? []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personaFiles, setPersonaFiles] = useState<PersonaFile[]>(nodeData.personaFiles ?? []);
  const [savedPaths, setSavedPaths] = useState<string[]>(nodeData.savedPaths ?? []);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-start interview on first mount if no messages
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || messages.length > 0 || !isElectron()) return;
    startedRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const greeting = await invoke<string>("architect_chat", {
          messages: [],
          projectName: label,
        });
        const msg: ChatMessage = { role: "assistant", content: greeting };
        setMessages([msg]);
        persistMessages([msg]);
      } catch (err: any) {
        setError(err?.message || "Failed to start architect");
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persistMessages = useCallback(
    (msgs: ChatMessage[], files?: PersonaFile[], paths?: string[]) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  messages: msgs,
                  ...(files !== undefined ? { personaFiles: files } : {}),
                  ...(paths !== undefined ? { savedPaths: paths } : {}),
                },
              }
            : n,
        ),
      );
      syncDebounced();
    },
    [id, setNodes, syncDebounced],
  );

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const reply = await invoke<string>("architect_chat", {
        messages: updated,
        projectName: label,
      });

      const assistantMsg: ChatMessage = { role: "assistant", content: reply };
      const allMessages = [...updated, assistantMsg];
      setMessages(allMessages);

      // Check if persona files are in the response
      const extracted = extractPersonaFiles(reply);
      if (extracted.length > 0) {
        setPersonaFiles(extracted);
        persistMessages(allMessages, extracted);
      } else {
        persistMessages(allMessages);
      }
    } catch (err: any) {
      setError(err?.message || "AI request failed");
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, label, persistMessages]);

  const handleSaveFiles = useCallback(async () => {
    if (personaFiles.length === 0 || !cwd) {
      toast.error("Defina o diretorio do projeto (cwd) primeiro.");
      return;
    }
    setSaving(true);
    const basePath = cwd.replace(/\\/g, "/").replace(/\/$/, "");
    const paths: string[] = [];
    try {
      for (const file of personaFiles) {
        const filePath = `${basePath}/${file.name}`;
        await invoke<{ success: boolean; path: string }>("fs_write_file", {
          filePath,
          content: file.content,
        });
        paths.push(filePath);
      }
      setSavedPaths(paths);
      persistMessages(messages, personaFiles, paths);
      toast.success(`${paths.length} persona(s) salva(s) com sucesso!`);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao salvar arquivos");
    } finally {
      setSaving(false);
    }
  }, [personaFiles, cwd, messages, persistMessages]);

  const handleCopy = useCallback(async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch { /* fallback in UI */ }
  }, []);

  if (isHibernated) {
    return (
      <NodeWrapper
        id={id} selected={selected} borderColor={BORDER_COLOR}
        minWidth={400} minHeight={350} label={label}
        badges={<span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-purple-500/20 text-purple-400 border-purple-500/30">sleep</span>}
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm" style={{ color: "var(--mx-text-muted)" }}>Hibernated</span>
        </div>
      </NodeWrapper>
    );
  }

  if (!isElectron()) {
    return (
      <NodeWrapper
        id={id} selected={selected} borderColor={BORDER_COLOR}
        minWidth={400} minHeight={350} label={label}
        badges={<span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-purple-500/20 text-purple-400 border-purple-500/30">web</span>}
        handles={HANDLES}
      >
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-center" style={{ color: "var(--mx-text-secondary)" }}>
            Use a versao Desktop para o Architect Node.
          </p>
        </div>
      </NodeWrapper>
    );
  }

  const hasFiles = personaFiles.length > 0;
  const hasSaved = savedPaths.length > 0;

  return (
    <NodeWrapper
      id={id} selected={selected} borderColor={BORDER_COLOR}
      minWidth={400} minHeight={350} label={label}
      badges={
        <>
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-purple-500/20 text-purple-400 border-purple-500/30">
            {messages.length} msgs
          </span>
          {hasFiles && !hasSaved && (
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-amber-500/20 text-amber-400 border-amber-500/30">
              {personaFiles.length} personas
            </span>
          )}
          {hasSaved && (
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              {savedPaths.length} saved
            </span>
          )}
        </>
      }
      statusLeft={cwd ? cwd.split(/[\\/]/).pop() : "no cwd"}
      statusRight={<span style={{ color: "rgba(139,92,246,0.6)" }}>architect</span>}
      handles={HANDLES}
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 nodrag nowheel" style={{ minHeight: 0 }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[90%] px-3 py-2 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap"
                style={{
                  background: msg.role === "user" ? "rgba(139,92,246,0.12)" : "var(--mx-surface-alt)",
                  color: "var(--mx-text)",
                  borderBottomRightRadius: msg.role === "user" ? 4 : 10,
                  borderBottomLeftRadius: msg.role === "assistant" ? 4 : 10,
                }}
              >
                {msg.role === "assistant" ? stripFileMarkers(msg.content) : msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-lg text-[11px]" style={{ background: "var(--mx-surface-alt)", color: "var(--mx-text-muted)" }}>
                <span className="inline-flex gap-0.5">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg text-[11px]" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Persona files action bar */}
        {hasFiles && !hasSaved && (
          <div
            className="shrink-0 flex items-center gap-2 px-3 py-2 nodrag"
            style={{ background: "rgba(139,92,246,0.06)", borderTop: "1px solid rgba(139,92,246,0.15)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "#8b5cf6", flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] flex-1" style={{ color: "#a78bfa" }}>
              {personaFiles.length} persona(s): {personaFiles.map((f) => f.name).join(", ")}
            </span>
            <button
              onClick={handleSaveFiles}
              disabled={saving || !cwd}
              className="px-3 py-1 text-[10px] font-semibold rounded transition-colors"
              style={{
                background: cwd ? "rgba(139,92,246,0.2)" : "var(--mx-surface-alt)",
                color: cwd ? "#a78bfa" : "var(--mx-text-muted)",
                border: `1px solid ${cwd ? "rgba(139,92,246,0.3)" : "var(--mx-border)"}`,
                cursor: cwd ? "pointer" : "not-allowed",
              }}
              title={cwd ? `Salvar ${personaFiles.length} arquivo(s) em ${cwd}/` : "Conecte a um terminal/vscode para definir o cwd"}
            >
              {saving ? "Salvando..." : personaFiles.length > 1 ? "Gerar Personas da Equipe" : "Gerar Persona"}
            </button>
          </div>
        )}

        {/* Success: ignition prompts */}
        {hasSaved && (
          <div
            className="shrink-0 px-3 py-2 nodrag space-y-2 overflow-y-auto nowheel"
            style={{ background: "rgba(16,185,129,0.06)", borderTop: "1px solid rgba(16,185,129,0.15)", maxHeight: 200 }}
          >
            <div className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "#10b981", flexShrink: 0 }}>
                <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-semibold" style={{ color: "#10b981" }}>
                {savedPaths.length} persona(s) salva(s)
              </span>
            </div>

            {personaFiles.map((file, idx) => {
              const ignitionCmd = buildIgnitionCmd(file.name);
              const shortPath = savedPaths[idx]?.split(/[\\/]/).slice(-2).join("/") ?? file.name;
              // Derive a terminal label from filename: "frontend_persona.md" -> "Frontend"
              const termLabel = file.name.replace(/_persona\.md$/i, "").replace(/^\w/, (c) => c.toUpperCase());
              return (
                <div key={file.name} className="rounded px-2 py-1.5" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-semibold" style={{ color: "#10b981" }}>
                      Terminal {idx + 1} ({termLabel}) — {shortPath}
                    </span>
                    <button
                      onClick={() => handleCopy(idx, ignitionCmd)}
                      className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                      style={{ background: copiedIdx === idx ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.1)", color: "#10b981" }}
                    >
                      {copiedIdx === idx ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--mx-text-secondary)" }}>
                    {ignitionCmd}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Input area */}
        <div
          className="shrink-0 flex gap-1.5 px-3 py-2 nodrag"
          style={{ borderTop: "1px solid var(--mx-border)" }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Descreva seu projeto..."
            rows={2}
            className="flex-1 resize-none rounded-lg px-2 py-1.5 text-[11px] outline-none nowheel"
            style={{
              background: "var(--mx-input-bg)",
              border: "1px solid var(--mx-input-border)",
              color: "var(--mx-text)",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="self-end px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all"
            style={{
              background: input.trim() && !loading ? "#8b5cf6" : "var(--mx-surface-alt)",
              color: input.trim() && !loading ? "white" : "var(--mx-text-muted)",
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
            }}
          >
            Enviar
          </button>
        </div>
      </div>
    </NodeWrapper>
  );
}

export default memo(ArchitectNode);

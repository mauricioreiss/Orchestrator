import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { invoke, openDialog } from "../lib/electron";
import { isElectron } from "../lib/electron";
import type { ChatMessage, DossierResult } from "../types";

interface PersonaArchitectModalProps {
  open: boolean;
  onClose: () => void;
  projectName?: string;
}

type Phase = "interview" | "template" | "dossier";

const TEMPLATE_FILES = [
  { label: "Principal", path: "_templates_personas/persona-principal.md" },
  { label: "Arquiteto", path: "_templates_personas/persona-arquiteto.md" },
  { label: "Inovacao", path: "_templates_personas/persona-inovacao.md" },
  { label: "CyberSec", path: "_templates_personas/persona-cybersec.md" },
];

export default function PersonaArchitectModal({ open, onClose, projectName }: PersonaArchitectModalProps) {
  const [phase, setPhase] = useState<Phase>("interview");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interviewComplete, setInterviewComplete] = useState(false);

  // Phase 2
  const [template, setTemplate] = useState("");

  // Phase 3
  const [dossier, setDossier] = useState("");
  const [ignitionPrompt, setIgnitionPrompt] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [appBasePath, setAppBasePath] = useState(".");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Resolve app base path for bundled resources
  useEffect(() => {
    invoke<string>("get_app_path").then(setAppBasePath).catch(() => {});
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase("interview");
      setMessages([]);
      setInput("");
      setLoading(false);
      setError(null);
      setInterviewComplete(false);
      setTemplate("");
      setDossier("");
      setIgnitionPrompt("");
      setSavedPath(null);
      setCopied(false);
      // Auto-start interview
      startInterview();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const startInterview = useCallback(async () => {
    if (!isElectron()) return;
    setLoading(true);
    setError(null);
    try {
      const greeting = await invoke<string>("persona_chat", {
        messages: [],
        projectName,
      });
      setMessages([{ role: "assistant", content: greeting }]);
    } catch (err: any) {
      setError(err?.message || "Failed to start interview");
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const reply = await invoke<string>("persona_chat", {
        messages: updated,
        projectName,
      });

      const assistantMsg: ChatMessage = { role: "assistant", content: reply };
      setMessages([...updated, assistantMsg]);

      if (reply.includes("INTERVIEW_COMPLETE")) {
        setInterviewComplete(true);
      }
    } catch (err: any) {
      setError(err?.message || "AI request failed");
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, projectName]);

  const handleLoadTemplate = useCallback(async () => {
    const path = await openDialog({ title: "Select persona template (.md)" });
    if (!path) return;
    try {
      const result = await invoke<{ content: string }>("fs_read_file", {
        rootDir: path.substring(0, path.lastIndexOf("\\")),
        relativePath: path.substring(path.lastIndexOf("\\") + 1),
      });
      setTemplate(result.content);
    } catch (err: any) {
      setError(err?.message || "Failed to read template file");
    }
  }, []);

  const handleQuickTemplate = useCallback(async (templatePath: string) => {
    try {
      const result = await invoke<{ content: string }>("fs_read_file", {
        rootDir: appBasePath,
        relativePath: templatePath,
      });
      setTemplate(result.content);
    } catch (err: any) {
      setError(err?.message || "Failed to load template");
    }
  }, [appBasePath]);

  const generateDossier = useCallback(async () => {
    if (!template.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const conversation = messages
        .map((m) => `**${m.role === "user" ? "Usuario" : "Arquiteto"}**: ${m.content}`)
        .join("\n\n");

      const result = await invoke<DossierResult>("persona_generate_dossier", {
        template,
        conversation,
        projectName: projectName || "Unnamed Project",
      });

      setDossier(result.dossier);
      setIgnitionPrompt(result.ignitionPrompt);
      setPhase("dossier");
    } catch (err: any) {
      setError(err?.message || "Dossier generation failed");
    } finally {
      setLoading(false);
    }
  }, [template, messages, projectName]);

  const handleSaveFile = useCallback(async () => {
    if (!dossier) return;
    try {
      const safeName = (projectName || "project").toLowerCase().replace(/\s+/g, "-");
      const filePath = await invoke<string | null>("dialog:save", {
        defaultPath: `persona-${safeName}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!filePath) return;

      await invoke<{ success: boolean; path: string }>("fs_write_file", {
        filePath,
        content: dossier,
      });
      setSavedPath(filePath);
    } catch (err: any) {
      setError(err?.message || "Failed to save file");
    }
  }, [dossier, projectName]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(ignitionPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback handled in UI (textarea shown)
    }
  }, [ignitionPrompt]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative flex flex-col"
            style={{
              width: 640,
              maxHeight: "80vh",
              background: "var(--mx-glass-bg)",
              border: "1px solid var(--mx-glass-border)",
              borderRadius: 12,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 0 40px rgba(168,85,247,0.15), 0 8px 32px rgba(0,0,0,0.4)",
            }}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-3 shrink-0"
              style={{ borderBottom: "1px solid var(--mx-border)" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#A855F7" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--mx-text)" }}>
                  Persona Architect
                </span>
                {projectName && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--mx-surface-alt)", color: "var(--mx-text-muted)" }}>
                    {projectName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Phase indicators */}
                {(["interview", "template", "dossier"] as Phase[]).map((p, i) => (
                  <div
                    key={p}
                    className="w-2 h-2 rounded-full transition-colors"
                    style={{
                      background: phase === p ? "#A855F7" : p === "interview" && (phase === "template" || phase === "dossier") ? "#10b981" : p === "template" && phase === "dossier" ? "#10b981" : "var(--mx-border)",
                    }}
                    title={["Entrevista", "Template", "Dossie"][i]}
                  />
                ))}
                <button
                  onClick={onClose}
                  className="ml-2 w-7 h-7 flex items-center justify-center rounded transition-colors"
                  style={{ color: "var(--mx-text-muted)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; e.currentTarget.style.color = "#ef4444"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--mx-text-muted)"; }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* === PHASE 1: Interview === */}
            {phase === "interview" && (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Messages area */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ maxHeight: "calc(80vh - 160px)" }}>
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className="max-w-[85%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed"
                        style={{
                          background: msg.role === "user" ? "rgba(168,85,247,0.15)" : "var(--mx-surface-alt)",
                          color: "var(--mx-text)",
                          borderBottomRightRadius: msg.role === "user" ? 4 : 12,
                          borderBottomLeftRadius: msg.role === "assistant" ? 4 : 12,
                        }}
                      >
                        {msg.content.replace("INTERVIEW_COMPLETE\n", "").replace("INTERVIEW_COMPLETE", "")}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="px-3.5 py-2.5 rounded-xl text-[13px]" style={{ background: "var(--mx-surface-alt)", color: "var(--mx-text-muted)" }}>
                        <span className="inline-flex gap-1">
                          <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                        </span>
                      </div>
                    </div>
                  )}
                  {error && (
                    <div className="px-3.5 py-2.5 rounded-xl text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                      {error}
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="shrink-0 px-5 py-3" style={{ borderTop: "1px solid var(--mx-border)" }}>
                  <div className="flex gap-2">
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
                      className="flex-1 resize-none rounded-lg px-3 py-2 text-[13px] outline-none"
                      style={{
                        background: "var(--mx-input-bg)",
                        border: "1px solid var(--mx-input-border)",
                        color: "var(--mx-text)",
                      }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || loading}
                      className="self-end px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
                      style={{
                        background: input.trim() && !loading ? "#A855F7" : "var(--mx-surface-alt)",
                        color: input.trim() && !loading ? "white" : "var(--mx-text-muted)",
                        cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                      }}
                    >
                      Enviar
                    </button>
                  </div>
                  <div className="flex justify-between mt-2">
                    <button
                      onClick={() => setPhase("template")}
                      className="text-[11px] transition-colors"
                      style={{ color: "var(--mx-text-muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mx-text)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mx-text-muted)")}
                    >
                      Pular Entrevista →
                    </button>
                    {interviewComplete && (
                      <button
                        onClick={() => setPhase("template")}
                        className="text-[11px] font-semibold px-3 py-1 rounded-lg transition-all"
                        style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}
                      >
                        Entrevista Completa — Continuar →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* === PHASE 2: Template === */}
            {phase === "template" && (
              <div className="flex flex-col flex-1 min-h-0 px-5 py-4">
                <p className="text-[13px] mb-3" style={{ color: "var(--mx-text-secondary)" }}>
                  Cole o template de persona abaixo ou selecione um template existente:
                </p>

                {/* Quick select buttons */}
                <div className="flex gap-2 mb-3 flex-wrap">
                  {TEMPLATE_FILES.map((t) => (
                    <button
                      key={t.path}
                      onClick={() => handleQuickTemplate(t.path)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                      style={{
                        background: "var(--mx-surface-alt)",
                        color: "var(--mx-text-secondary)",
                        border: "1px solid var(--mx-border)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#A855F7"; e.currentTarget.style.color = "#A855F7"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--mx-border)"; e.currentTarget.style.color = "var(--mx-text-secondary)"; }}
                    >
                      {t.label}
                    </button>
                  ))}
                  <button
                    onClick={handleLoadTemplate}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{ background: "var(--mx-surface-alt)", color: "var(--mx-text-secondary)", border: "1px solid var(--mx-border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#A855F7"; e.currentTarget.style.color = "#A855F7"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--mx-border)"; e.currentTarget.style.color = "var(--mx-text-secondary)"; }}
                  >
                    Carregar Arquivo...
                  </button>
                </div>

                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder={"# Minha Persona\n\nCole o template de persona aqui..."}
                  className="flex-1 resize-none rounded-lg px-4 py-3 text-[12px] font-mono outline-none"
                  style={{
                    background: "var(--mx-input-bg)",
                    border: "1px solid var(--mx-input-border)",
                    color: "var(--mx-text)",
                    minHeight: 200,
                  }}
                />

                {error && (
                  <div className="mt-2 px-3 py-2 rounded-lg text-[12px]" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                    {error}
                  </div>
                )}

                <div className="flex justify-between mt-3">
                  <button
                    onClick={() => setPhase("interview")}
                    className="text-[11px] transition-colors"
                    style={{ color: "var(--mx-text-muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mx-text)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mx-text-muted)")}
                  >
                    ← Voltar
                  </button>
                  <button
                    onClick={generateDossier}
                    disabled={!template.trim() || loading}
                    className="px-5 py-2 rounded-lg text-[13px] font-medium transition-all"
                    style={{
                      background: template.trim() && !loading ? "#A855F7" : "var(--mx-surface-alt)",
                      color: template.trim() && !loading ? "white" : "var(--mx-text-muted)",
                      cursor: template.trim() && !loading ? "pointer" : "not-allowed",
                    }}
                  >
                    {loading ? "Gerando..." : "Gerar Dossie"}
                  </button>
                </div>
              </div>
            )}

            {/* === PHASE 3: Dossier Output === */}
            {phase === "dossier" && (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Dossier preview */}
                <div className="flex-1 overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(80vh - 220px)" }}>
                  <div className="prose prose-sm prose-invert max-w-none markdown-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{dossier}</ReactMarkdown>
                  </div>
                </div>

                {/* Ignition prompt + actions */}
                <div className="shrink-0 px-5 py-3 space-y-3" style={{ borderTop: "1px solid var(--mx-border)" }}>
                  {savedPath && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Arquivo salvo: {savedPath}
                    </div>
                  )}

                  {/* Ignition prompt block */}
                  <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold" style={{ color: "#A855F7" }}>Prompt de Ignicao</span>
                      <button
                        onClick={handleCopy}
                        className="text-[10px] px-2 py-0.5 rounded transition-colors"
                        style={{
                          background: copied ? "rgba(16,185,129,0.15)" : "rgba(168,85,247,0.15)",
                          color: copied ? "#10b981" : "#A855F7",
                        }}
                      >
                        {copied ? "Copiado!" : "Copiar"}
                      </button>
                    </div>
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--mx-text-secondary)" }}>
                      {ignitionPrompt}
                    </p>
                  </div>

                  <div className="flex justify-between">
                    <button
                      onClick={() => setPhase("template")}
                      className="text-[11px] transition-colors"
                      style={{ color: "var(--mx-text-muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mx-text)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mx-text-muted)")}
                    >
                      ← Voltar
                    </button>
                    <button
                      onClick={handleSaveFile}
                      className="px-5 py-2 rounded-lg text-[13px] font-medium transition-all"
                      style={{ background: "#A855F7", color: "white" }}
                    >
                      Salvar Arquivo
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

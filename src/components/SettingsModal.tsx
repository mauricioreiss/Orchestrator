import { useState, useEffect, useCallback } from "react";
import { invoke } from "../lib/electron";
import { AnimatePresence, motion } from "framer-motion";
import { isElectron } from "../lib/electron";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDERS = [
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini" },
  { value: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-4-5-20250929" },
] as const;

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || !isElectron()) return;

    Promise.all([
      invoke<string | null>("get_setting", { key: "translator_provider" }),
      invoke<string | null>("get_secure_setting", { key: "translator_api_key" }),
      invoke<string | null>("get_setting", { key: "translator_model" }),
    ]).then(([prov, key, mod]) => {
      if (prov) setProvider(prov);
      if (key) setApiKey(key);
      if (mod) setModel(mod);
    }).catch((e) => console.error("Failed to load settings:", e));
  }, [open]);

  const handleSave = useCallback(async () => {
    if (!isElectron()) return;
    setSaving(true);
    try {
      await invoke("set_setting", { key: "translator_provider", value: provider });
      if (apiKey) {
        await invoke("set_secure_setting", { key: "translator_api_key", value: apiKey });
      }
      const modelValue = model || PROVIDERS.find((p) => p.value === provider)?.defaultModel || "";
      await invoke("set_setting", { key: "translator_model", value: modelValue });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  }, [provider, apiKey, model]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const currentDefault = PROVIDERS.find((p) => p.value === provider)?.defaultModel ?? "";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="w-[460px] rounded-xl overflow-hidden"
            style={{
              background: "var(--mx-glass-bg)",
              border: "1px solid var(--mx-glass-border)",
              boxShadow: "0 0 40px var(--mx-accent-glow), 0 16px 64px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ background: "var(--mx-titlebar)", borderBottom: "1px solid var(--mx-border)" }}
            >
              <h2 className="text-sm font-semibold" style={{ color: "var(--mx-text)" }}>
                AI Provider Settings
              </h2>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded transition-colors"
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

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Provider selector */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--mx-text-secondary)" }}>
                  AI Provider
                </label>
                <div className="flex gap-2">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setProvider(p.value)}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background: provider === p.value ? "var(--mx-accent-glow)" : "var(--mx-input-bg)",
                        color: provider === p.value ? "var(--mx-accent)" : "var(--mx-text-muted)",
                        border: `1px solid ${provider === p.value ? "var(--mx-accent)" : "var(--mx-input-border)"}`,
                        opacity: provider === p.value ? 1 : 0.8,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--mx-text-secondary)" }}>
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`${provider === "openai" ? "sk-..." : "sk-ant-..."}`}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{
                    background: "var(--mx-input-bg)",
                    border: "1px solid var(--mx-input-border)",
                    color: "var(--mx-text)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--mx-accent)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--mx-input-border)")}
                />
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--mx-text-secondary)" }}>
                  Model
                  <span className="ml-1" style={{ color: "var(--mx-text-muted)" }}>(default: {currentDefault})</span>
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={currentDefault}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{
                    background: "var(--mx-input-bg)",
                    border: "1px solid var(--mx-input-border)",
                    color: "var(--mx-text)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--mx-accent)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--mx-input-border)")}
                />
              </div>

              {/* Info */}
              <div
                className="p-3 rounded-lg"
                style={{ background: "var(--mx-surface-alt)", border: "1px solid var(--mx-border)" }}
              >
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--mx-text-muted)" }}>
                  API keys are encrypted with OS keychain (safeStorage). They never leave
                  your machine except when calling the provider API directly.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-end gap-3 px-5 py-3"
              style={{ background: "var(--mx-titlebar)", borderTop: "1px solid var(--mx-border)" }}
            >
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg text-sm transition-colors"
                style={{ color: "var(--mx-text-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mx-text)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mx-text-muted)")}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !apiKey}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: saved ? "rgba(16,185,129,0.2)" : "var(--mx-accent-glow)",
                  color: saved ? "#10b981" : "var(--mx-accent)",
                  border: `1px solid ${saved ? "rgba(16,185,129,0.3)" : "var(--mx-accent)"}`,
                }}
              >
                {saving ? "Saving..." : saved ? "Saved" : "Save"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

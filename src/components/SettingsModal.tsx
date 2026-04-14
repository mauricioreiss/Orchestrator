import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";

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

  // Load current settings
  useEffect(() => {
    if (!open || !isTauri()) return;

    Promise.all([
      invoke<string | null>("get_setting", { key: "translator_provider" }),
      invoke<string | null>("get_setting", { key: "translator_api_key" }),
      invoke<string | null>("get_setting", { key: "translator_model" }),
    ]).then(([prov, key, mod]) => {
      if (prov) setProvider(prov);
      if (key) setApiKey(key);
      if (mod) setModel(mod);
    }).catch((e) => console.error("Failed to load settings:", e));
  }, [open]);

  const handleSave = useCallback(async () => {
    if (!isTauri()) return;
    setSaving(true);
    try {
      await invoke("set_setting", { key: "translator_provider", value: provider });
      if (apiKey) {
        await invoke("set_setting", { key: "translator_api_key", value: apiKey });
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

  if (!open) return null;

  const currentDefault = PROVIDERS.find((p) => p.value === provider)?.defaultModel ?? "";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-[460px] rounded-xl overflow-hidden shadow-2xl"
        style={{
          background: "rgba(24,24,37,0.95)",
          border: "1px solid rgba(49,50,68,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#11111b]/80 border-b border-[#313244]/50">
          <h2 className="text-sm font-semibold text-[#cdd6f4]">
            Maestro Translator Settings
          </h2>
          <button
            onClick={onClose}
            className="text-[#6c7086] hover:text-[#cdd6f4] transition-colors text-lg leading-none"
          >
            x
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Provider selector */}
          <div>
            <label className="block text-xs font-medium text-[#a6adc8] mb-1.5">
              AI Provider
            </label>
            <div className="flex gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setProvider(p.value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    provider === p.value
                      ? "bg-violet-500/30 text-violet-300 border border-violet-500/50"
                      : "bg-[#1e1e2e] text-[#6c7086] border border-[#313244]/50 hover:text-[#a6adc8]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-[#a6adc8] mb-1.5">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`${provider === "openai" ? "sk-..." : "sk-ant-..."}`}
              className="w-full px-3 py-2 rounded-lg bg-[#1e1e2e] border border-[#313244]/50 text-sm text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-[#a6adc8] mb-1.5">
              Model
              <span className="text-[#6c7086] ml-1">(default: {currentDefault})</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={currentDefault}
              className="w-full px-3 py-2 rounded-lg bg-[#1e1e2e] border border-[#313244]/50 text-sm text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Info */}
          <div className="p-3 rounded-lg bg-[#11111b]/60 border border-[#313244]/30">
            <p className="text-[11px] text-[#6c7086] leading-relaxed">
              API keys are stored locally in SQLite. They never leave your machine
              except when calling the provider API directly.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 bg-[#11111b]/80 border-t border-[#313244]/50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !apiKey}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              saved
                ? "bg-emerald-500/30 text-emerald-300"
                : "bg-violet-500/30 text-violet-300 hover:bg-violet-500/40"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

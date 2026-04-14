import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";
import type { CodeServerDetection } from "../types";

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
}

export default function WelcomeModal({ open, onClose }: WelcomeModalProps) {
  const [detection, setDetection] = useState<CodeServerDetection | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (!isTauri()) {
      setDetection({ found: false, path: null, source: null });
      setChecking(false);
      return;
    }
    invoke<CodeServerDetection>("detect_code_server")
      .then(setDetection)
      .catch(() => setDetection({ found: false, path: null, source: null }))
      .finally(() => setChecking(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-[480px] rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: "rgba(24,24,37,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(49,50,68,0.5)",
          boxShadow: "0 0 30px rgba(124,58,237,0.1), 0 16px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-2xl font-bold text-[#cdd6f4]">Maestri-X</h1>
          <p className="text-sm text-[#a6adc8] mt-1">
            Terminal orchestration canvas
          </p>
        </div>

        {/* VS Code check */}
        <div className="px-6 py-4 border-y border-[#313244]/50">
          <div className="flex items-center gap-3">
            {checking ? (
              <div className="w-5 h-5 border-2 border-[#7c3aed] border-t-transparent rounded-full animate-spin shrink-0" />
            ) : detection?.found ? (
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 3v4M6 9h.01"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}
            <div>
              <p className="text-sm text-[#cdd6f4] font-medium">
                {checking
                  ? "Checking VS Code..."
                  : detection?.found
                    ? `VS Code found (${detection.source})`
                    : "VS Code not found"}
              </p>
              {!checking && !detection?.found && (
                <p className="text-xs text-[#6c7086] mt-1">
                  VS Code is needed for embedded editor nodes. Terminal nodes
                  work without it.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 flex justify-end gap-3">
          {!detection?.found && !checking && (
            <a
              href="https://code.visualstudio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm text-[#a6adc8] hover:text-[#cdd6f4] transition-colors"
            >
              Download VS Code
            </a>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#7c3aed] hover:bg-[#7c3aed]/80 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}

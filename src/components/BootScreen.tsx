import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke, openDialog } from "../lib/electron";
import { isElectron } from "../lib/electron";
import { useTheme } from "../contexts/ThemeContext";
import { useCanvasStore } from "../store/canvasStore";
import type { CodeServerDetection } from "../types";

interface BootScreenProps {
  open: boolean;
  onClose: () => void;
}

export default function BootScreen({ open: isOpen, onClose }: BootScreenProps) {
  const [detection, setDetection] = useState<CodeServerDetection | null>(null);
  const [checking, setChecking] = useState(true);
  const { theme, toggleTheme } = useTheme();
  useEffect(() => {
    if (!isOpen) return;
    if (!isElectron()) {
      setDetection({ found: false, path: null, source: null });
      setChecking(false);
      return;
    }
    invoke<CodeServerDetection>("detect_code_server")
      .then(setDetection)
      .catch(() => setDetection({ found: false, path: null, source: null }))
      .finally(() => setChecking(false));
  }, [isOpen]);

  const handleOpenVault = async () => {
    if (!isElectron()) { onClose(); return; }
    const selected = await openDialog({ directory: true, multiple: false, title: "Select Obsidian Vault" });
    if (selected) {
      const store = useCanvasStore.getState();
      const count = store.nodes.filter((n) => n.type === "obsidian").length + 1;
      store.addNode({
        id: crypto.randomUUID(),
        type: "obsidian",
        position: { x: 100, y: 100 },
        data: { type: "obsidian", label: `Vault ${count}`, vaultPath: selected },
        style: { width: 380, height: 400 },
      });
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9990] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0" style={{ background: "var(--mx-bg)" }} />

        {/* Content */}
        <motion.div
          className="relative flex flex-col items-center gap-8 p-10 rounded-2xl max-w-md w-full mx-4"
          style={{
            background: "var(--mx-glass-bg)",
            backdropFilter: "blur(20px)",
            border: "1px solid var(--mx-glass-border)",
            boxShadow: "0 0 60px var(--mx-accent-glow), 0 16px 64px rgba(0,0,0,0.3)",
          }}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {/* Brand */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold"
              style={{ background: "var(--mx-accent)", color: "#ffffff" }}
            >
              M
            </div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--mx-text)" }}>
              Maestri-X
            </h1>
            <p className="text-sm" style={{ color: "var(--mx-text-secondary)" }}>
              Terminal Orchestration Canvas
            </p>
          </div>

          {/* VS Code detection */}
          <div
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg"
            style={{ background: "var(--mx-surface-alt)", border: "1px solid var(--mx-border)" }}
          >
            {checking ? (
              <div className="w-5 h-5 border-2 rounded-full animate-spin shrink-0" style={{ borderColor: "var(--mx-accent)", borderTopColor: "transparent" }} />
            ) : detection?.found ? (
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 3v4M6 9h.01" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            )}
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--mx-text)" }}>
                {checking ? "Checking VS Code..." : detection?.found ? `VS Code found (${detection.source})` : "VS Code not found"}
              </p>
              {!checking && !detection?.found && (
                <p className="text-xs mt-0.5" style={{ color: "var(--mx-text-muted)" }}>
                  Terminal nodes work without it.
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={onClose}
              className="w-full py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "var(--mx-accent)", color: "#ffffff" }}
            >
              Start Empty Canvas
            </button>
            <button
              onClick={handleOpenVault}
              className="w-full py-3 rounded-lg text-sm font-medium transition-all"
              style={{
                background: "var(--mx-surface-alt)",
                border: "1px solid var(--mx-border)",
                color: "var(--mx-text-secondary)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--mx-border-strong)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--mx-border)")}
            >
              Open Local Vault
            </button>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--mx-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mx-sidebar-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M17 11.5A7.5 7.5 0 018.5 3a7.5 7.5 0 108.5 8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          {/* Version */}
          <p className="text-[10px]" style={{ color: "var(--mx-text-muted)" }}>
            v0.1.0
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

import { useState, useEffect, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Toaster } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { invoke, isElectron } from "./lib/electron";
import Canvas from "./components/Canvas";
import Sidebar from "./components/Sidebar";
import BootScreen from "./components/BootScreen";
import SettingsModal from "./components/SettingsModal";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { useCanvasStore } from "./store/canvasStore";
import { useAuthStore } from "./store/authStore";
import { useApprovalListener } from "./hooks/useApprovalListener";
import { useSwarmRouter } from "./hooks/useSwarmRouter";
import { useTaskWatcher } from "./hooks/useTaskWatcher";
import LoginScreen from "./components/LoginScreen";
import CommandPalette from "./components/CommandPalette";

/** Renders Toaster with current theme from context. */
function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      position="top-right"
      theme={theme}
      richColors
      className="no-drag-region"
      toastOptions={{
        style: {
          background: "var(--mx-glass-bg)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--mx-glass-border)",
          fontFamily: "Inter, system-ui, sans-serif",
        },
      }}
    />
  );
}

/** Workspace content — only mounts when authenticated */
function WorkspaceContent() {
  const [showBoot, setShowBoot] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<"checking" | "ok" | "fail">("checking");
  const loaded = useCanvasStore((s) => s.loaded);
  const nodeCount = useCanvasStore((s) => s.nodes.length);

  useApprovalListener();
  useSwarmRouter();
  useTaskWatcher();

  useEffect(() => {
    const electronDetected = isElectron();
    console.log(`[orchestrated-space] isElectron() = ${electronDetected}`);
    if (!electronDetected) {
      console.warn("[orchestrated-space] No Electron bridge detected — running in browser mode");
      setBridgeStatus("fail");
      return;
    }
    invoke<string>("ping")
      .then((r) => {
        console.log(`[orchestrated-space] Ping response: ${r} — IPC bridge is working`);
        setBridgeStatus("ok");
      })
      .catch((e) => {
        console.error("[orchestrated-space] Ping FAILED:", e);
        setBridgeStatus("fail");
      });
  }, []);

  useEffect(() => {
    if (loaded && nodeCount === 0) setShowBoot(true);
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSettings = useCallback(() => setShowSettings(true), []);

  return (
    <>
      <ThemedToaster />
      <div className="fixed top-0 left-0 w-full h-9 z-[9998] drag-region" />
      <ReactFlowProvider>
        <div className="flex w-full h-full" style={{ background: "var(--mx-bg)" }}>
          <Sidebar onOpenSettings={openSettings} />
          <div className="flex-1 h-full min-w-0">
            <Canvas />
          </div>
        </div>

        <CommandPalette onOpenSettings={openSettings} />

        <BootScreen
          open={showBoot}
          onClose={() => setShowBoot(false)}
        />
        <SettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
        />

        {bridgeStatus !== "ok" && (
          <div className="fixed bottom-4 left-16 z-[9999] px-3 py-2 rounded-lg text-xs font-mono"
            style={{
              background: bridgeStatus === "checking" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
              border: `1px solid ${bridgeStatus === "checking" ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)"}`,
              color: bridgeStatus === "checking" ? "#f59e0b" : "#ef4444",
            }}>
            {bridgeStatus === "checking"
              ? "Verificando ponte IPC..."
              : "Ambiente Web — use a versao Desktop para funcionalidade completa"}
          </div>
        )}
      </ReactFlowProvider>
    </>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <ThemeProvider>
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <motion.div
            key="login"
            initial={{ opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="fixed top-0 left-0 w-full h-9 z-[9998] drag-region" />
            <LoginScreen />
          </motion.div>
        ) : (
          <motion.div
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="w-full h-full"
          >
            <WorkspaceContent />
          </motion.div>
        )}
      </AnimatePresence>
    </ThemeProvider>
  );
}

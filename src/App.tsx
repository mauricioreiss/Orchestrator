import { useState, useEffect, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { invoke } from "@tauri-apps/api/core";
import Canvas from "./components/Canvas";
import WelcomeModal from "./components/WelcomeModal";
import SettingsModal from "./components/SettingsModal";
import { useCanvasStore } from "./store/canvasStore";
import { isTauri } from "./lib/tauri";

export default function App() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<"checking" | "ok" | "fail">("checking");
  const loaded = useCanvasStore((s) => s.loaded);
  const nodeCount = useCanvasStore((s) => s.nodes.length);

  // IPC handshake: verify the Tauri bridge is alive
  useEffect(() => {
    const tauriDetected = isTauri();
    console.log(`[maestri-x] isTauri() = ${tauriDetected}`);
    console.log(`[maestri-x] __TAURI_INTERNALS__ =`, (window as any).__TAURI_INTERNALS__); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (!tauriDetected) {
      console.warn("[maestri-x] No Tauri bridge detected — running in browser mode");
      setBridgeStatus("fail");
      return;
    }

    invoke<string>("ping")
      .then((r) => {
        console.log(`[maestri-x] Ping response: ${r} — IPC bridge is working`);
        setBridgeStatus("ok");
      })
      .catch((e) => {
        console.error("[maestri-x] Ping FAILED:", e);
        setBridgeStatus("fail");
      });
  }, []);

  // Show welcome on first launch (empty canvas after load)
  useEffect(() => {
    if (loaded && nodeCount === 0) {
      setShowWelcome(true);
    }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSettings = useCallback(() => setShowSettings(true), []);

  return (
    <ReactFlowProvider>
      <div className="w-full h-full bg-mx-bg">
        <Canvas onOpenSettings={openSettings} />
        <WelcomeModal
          open={showWelcome}
          onClose={() => setShowWelcome(false)}
        />
        <SettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
        />

        {/* IPC bridge status indicator (debug, bottom-left) */}
        {bridgeStatus !== "ok" && (
          <div className="fixed bottom-4 left-4 z-[9999] px-3 py-2 rounded-lg text-xs font-mono"
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
      </div>
    </ReactFlowProvider>
  );
}

import { useState, useEffect, useRef, type RefObject } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/tauri";
import type { PtyInfo } from "../types";

interface UsePtyOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  cwd?: string;
  label?: string;
  disabled?: boolean;
}

interface UsePtyReturn {
  ptyId: string | null;
  connected: boolean;
  fit: () => void;
}

const TERM_THEME = {
  background: "#11111b",
  foreground: "#cdd6f4",
  cursor: "#f5e0dc",
  selectionBackground: "#585b7066",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#bac2de",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#f5c2e7",
  brightCyan: "#94e2d5",
  brightWhite: "#a6adc8",
};

export function usePty({
  containerRef,
  cwd,
  label,
  disabled = false,
}: UsePtyOptions): UsePtyReturn {
  const [ptyId, setPtyId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Initialize xterm.js + spawn PTY + wire everything
  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled || !isTauri()) {
      // Reset state when disabled/not native so UI can show placeholder
      if (disabled || !isTauri()) {
        setPtyId(null);
        setConnected(false);
      }
      return;
    }

    // Clear container (handles React StrictMode double-mount)
    container.innerHTML = "";

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      theme: TERM_THEME,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    requestAnimationFrame(() => fitAddon.fit());

    termRef.current = term;
    fitRef.current = fitAddon;

    let localPtyId: string | null = null;
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    let unlistenInjection: (() => void) | null = null;

    const init = async () => {
      try {
        const dims = fitAddon.proposeDimensions();
        const cols = dims?.cols ?? 80;
        const rows = dims?.rows ?? 24;

        const info = await invoke<PtyInfo>("spawn_pty", {
          cols,
          rows,
          cwd: cwd ?? null,
          label: label ?? null,
        });

        localPtyId = info.id;
        setPtyId(info.id);
        setConnected(true);

        // PTY output → xterm.js
        unlistenOutput = await listen<number[]>(
          `pty-output-${info.id}`,
          (event) => {
            term.write(new Uint8Array(event.payload));
          },
        );

        // PTY exit → mark disconnected
        unlistenExit = await listen<string>(
          `pty-exit-${info.id}`,
          () => {
            setConnected(false);
            term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
          },
        );

        // Context injection → render directly in xterm.js (notes, obsidian, leader briefings)
        unlistenInjection = await listen<string>(
          `context-injection-${info.id}`,
          (event) => {
            term.write(event.payload);
          },
        );

        // Keystrokes → PTY stdin
        term.onData((input) => {
          if (localPtyId) {
            const bytes = Array.from(new TextEncoder().encode(input));
            invoke("write_pty", { id: localPtyId, data: bytes });
          }
        });

        // Terminal resize → PTY resize
        term.onResize(({ cols, rows }) => {
          if (localPtyId) {
            invoke("resize_pty", { id: localPtyId, cols, rows });
          }
        });
      } catch (err) {
        term.write(`\x1b[31mFailed to spawn PTY: ${err}\x1b[0m\r\n`);
      }
    };

    init();

    // Auto-fit when container resizes (e.g., node resized in React Flow)
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon.fit());
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (localPtyId) {
        invoke("kill_pty", { id: localPtyId }).catch(() => {});
      }
      unlistenOutput?.();
      unlistenExit?.();
      unlistenInjection?.();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = () => fitRef.current?.fit();

  return { ptyId, connected, fit };
}

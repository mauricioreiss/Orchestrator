# Maestri-X Napkin

## IDENTIDADE
Maestri-X = Sistema Operacional de Orquestracao para Devs Senior.
Canvas infinito (estilo n8n/Raycast) onde VS Code, Terminais PTY, Browsers e Notas coexistem e se comunicam.

## STACK ATUAL (2026-04-15)
- **Backend**: Electron main process (Node.js/TypeScript)
- **Frontend**: React 18 + TypeScript + Vite
- **Canvas**: React Flow 12.6
- **State**: Zustand + SQLite (better-sqlite3)
- **Terminais**: xterm.js + node-pty
- **UI**: Tailwind + Glassmorphism + Inter/JetBrains Mono
- **BrowserNode**: Electron `<webview>` tag (NO iframe, NO proxy needed)
- **Header bypass**: Electron session.webRequest (strips X-Frame-Options/CSP) — still used by VSCodeNode iframe
- **Logging**: electron-log v5 (file + console transports, 5MB rotation)
- **IPC Bridge**: `window.maestriAPI` via contextBridge (typed in `src/global.d.ts`)

## ARQUITETURA

### Backend (electron/)
9 services em `electron/services/`, 32 IPC handlers em `electron/ipc/handlers.ts`
- PtyService: node-pty + 8KB ring buffer + 16ms coalesce
- ProxyService: dedicated micro-proxy per BrowserNode instance (OS-assigned port)
- PersistenceService: better-sqlite3 WAL mode, prepared statements
- ContextService: Maestro Bus (graph diff, action dispatch)
- CodeServerService: VS Code serve-web spawn, TCP readiness
- VaultService: fs.readdir/readFile + path traversal prevention
- SupervisorService: cleanup coordinator (PTY + code-server)
- TranslatorService: fetch OpenAI/Anthropic + fuzzy-nav local
- MonitorService: os.cpus/freemem + delta CPU

### Frontend (src/)
- Zustand store: `src/store/canvasStore.ts`
- Custom hooks: `src/hooks/use*.ts`
- isElectron() guard before any invoke
- listen() returns sync unlisten fn (NOT Promise)

## BUILD COMMANDS
```bash
npx tsc --noEmit                          # Frontend TS check
cd electron && npx tsc --noEmit           # Electron TS check
npm run electron:dev                       # Dev mode (Vite + Electron)
npm run electron:build                     # Build .exe (electron-builder)
npm run electron:rebuild                   # Rebuild native addons
```

## REGRAS DE ENGENHARIA
- `electron/package.json` com `"type": "commonjs"` (root has "type": "module" for Vite)
- node-pty e better-sqlite3 sao native addons: MUST electron-rebuild after npm install
- strip-ansi pinned to v6 (last CJS; v7+ ESM-only)
- VS Code serve-web: Code.exe direto via ELECTRON_RUN_AS_NODE=1 + cli.js
- .cmd/.bat files require `shell: true` in child_process.spawn
- NEVER pass --locale to code serve-web (crashes)
- memo() em todos os nodes para React Flow virtualization
- useShallow() (zustand/react/shallow) em todos os seletores de array (hibernatedGroups)
- NodeErrorBoundary: HOC withErrorBoundary() em Canvas.tsx envolve todos os 10 node types
- NoteNode: useEdges() removido, usa getEdges() on-demand no handleExecute (zero edge subscriptions)
- BrowserNode: `<webview>` tag, no proxy needed (separate guest process, no X-Frame-Options issue)
- `webviewTag: true` in BrowserWindow webPreferences
- VS Code: direct iframe to port (NO proxy), folder path needs leading `/` on Windows
- CodeServerService.stop(): uses tree-kill npm package for cross-platform process tree killing
- main.ts: killAllChildProcesses() runs on before-quit + window-all-closed (sync execSync sweep)
- PtyService.spawn(): validates cols/rows/cwd/shell with safe defaults (80x24, USERPROFILE, COMSPEC)
- pty.spawn() second arg MUST be `[]` literal — C++ binding crashes if args is undefined/not-Array
- useConpty MUST be true — winpty was removed from electron-rebuild (binding.gyp patched)
- IPC handler spawn_pty: hard-sanitize Number()/typeof before forwarding to PtyService (belt+suspenders)
- NEVER pass --extensions-dir to serve-web (not a valid flag, crashes the server). Use Settings Sync.
- Smart Context: VSCode→Terminal edge sends `cd "workspacePath"` to live PTY + sets cwd in Zustand
- Smart Context: VSCode→Browser edge injects `http://localhost:5173` as default dev URL
- Edge validation: vscode→browser and monaco→terminal are valid connections
- MonacoNode: @monaco-editor/react, read-only v1, indigo #6366f1, nodrag nowheel, JetBrains Mono, theme-aware
- FileExplorer: 260px right panel, glassmorphism, lazy-load tree, double-click creates MonacoNode
- FileSystemService: stateless FS reader (VaultService pattern), safeResolve, 1MB max, HIDDEN_DIRS filter
- IPC: `fs_read_directory`, `fs_read_file` — whitelisted in preload.ts
- NodeWrapper: inline rename via pencil icon click (all nodes), persists via setNodes + syncDebounced
- KanbanNode: column title rename via double-click, board overflow-y: hidden (prevents nested scroll conflicts)
- IPC bridge: `window.maestriAPI` (renamed from electronAPI), typed via `src/global.d.ts`, zero `(window as any)` casts
- Logging: `import log from "../log"` in all electron services — NEVER use console.log/error/warn in electron/
- electron-log config: `electron/log.ts`, file transport 5MB max, format `[date] [level] text`
- Log files at: `%APPDATA%/maestri-x/logs/main.log` (Windows)

## COMPONENTES PROTEGIDOS
- `electron/ipc/handlers.ts` — IPC surface, changes affect entire app
- `electron/services/ContextService.ts` — Maestro Bus graph diff logic
- `src/store/canvasStore.ts` — Zustand global state + auto-save
- `src/hooks/usePty.ts` — PTY lifecycle (listen/unlisten timing)

## COMPLETED
- Fase 1-10: All Tauri-era features
- Electron Migration (2026-04-14): Full backend rewrite Tauri/Rust -> Electron/Node.js
- PTY fix: useConpty: false + COMSPEC shell + try-catch kill
- Browser fix: session.webRequest header bypass, removed url-proxy
- Clean code: deleted src-tauri, removed dead url-proxy code, cleaned comments
- VS Code zombie fix (2026-04-15): tree-kill package in CodeServerService + sync PID sweep in main.ts
- VS Code folder fix (2026-04-15): leading `/` on Windows paths for VFS recognition
- PTY spawn fix (2026-04-15): safe defaults prevent node-pty argument mismatch crash
- VS Code extensions fix (2026-04-15): --extensions-dir is NOT a valid serve-web flag (removed)
- Smart Context v1 (2026-04-15): VSCode→Terminal edge auto-cd into workspace folder
- Webview refactor (2026-04-15): BrowserNode iframe→webview, removed proxy dependency, did-navigate URL sync
- Smart Context v2 (2026-04-15): VSCode→Browser edge auto-injects localhost:5173 (Vite Live Preview)
- Performance hardening (2026-04-15): useShallow selectors + NoteNode useEdges→getEdges + NodeErrorBoundary HOC
- Kanban DnD (2026-04-15): @hello-pangea/dnd replaces framer-motion Reorder, cross-column card drag, column reorder, priority colors, column colors
- Context Injection fix (2026-04-15): raw content to PTY stdin, no ANSI banners/clear-screen
- Browser URL auto-complete (2026-04-15): bare words get `.com` suffix + `https://` prefix
- useConpty fix (2026-04-15): MUST be true — winpty removed from build, false breaks C++ binding
- Inline Rename (2026-04-15): NodeWrapper title bar click-to-edit (all 9 node types), Kanban column double-click rename
- Kanban scroll fix (2026-04-15): board container overflow-y: hidden, columns keep overflow-y: auto
- Enterprise Foundation (2026-04-15): maestriAPI typed bridge (global.d.ts), electron-log file logging, zero console.* in backend
- UX Polish (2026-04-15): save status indicator (idle/saving/saved) in StatusBar, Settings cog icon fix, conpty log filter
- PTY-Broadcast Protocol (2026-04-15): [BROADCAST] token detection in PtyService, fan-out to connected terminals, visual edge animation ("broadcasting" status in FlowEdge)
- Premium Canvas Background (2026-04-15): radial gradient depth glow (--mx-canvas-glow), refined dot grid (--mx-grid-dot), theme-aware
- HITL Protocol (2026-04-15): [ASK_APPROVAL] token → pending command queue → sonner toast (Approve/Reject) → approve_agent_action/reject_agent_action IPC
- Sonner Toasts (2026-04-15): sonner installed, ThemedToaster with glassmorphism, positioned top-right
- Monaco Spatial IDE (2026-04-15): MonacoNode + FileSystemService + FileExplorer panel, 10th node type, read-only v1

## REGRAS DO BROADCAST
- AI agent writes `[BROADCAST] <command>` to stdout → PtyService strips it from renderer output
- PtyService.extractTokens(): splits lines, strips ANSI, matches `^\[BROADCAST]\s*(.+)$` and `^\[ASK_APPROVAL]\s*(.+)$`
- broadcastHandler callback: registered in handlers.ts, uses ContextService.getLastGraph() for topology
- Fan-out: finds terminal→terminal edges from source, writes `command + \r\n` to each target PTY
- Visual: `pty-broadcast` IPC event → useBroadcast hook → sets edge data.status = "broadcasting" for 1.5s
- FlowEdge "broadcasting": emerald green (#10b981), 6 fast cascading dots (0.5s), wide pulsing glow
- Event prefix: `pty-broadcast` added to preload.ts ALLOWED_EVENT_PREFIXES

## REGRAS DO HITL (Human-in-the-Loop)
- AI agent writes `[ASK_APPROVAL] rm -rf node_modules` → PtyService strips from output, stores in pendingApprovals Map
- approvalHandler callback: registered in handlers.ts, resolves ptyId→nodeId via graph, sends `agent-approval-request` IPC event
- Frontend: useApprovalListener hook → sonner toast with `duration: Infinity` (persistent until user acts)
- Approve: invokes `approve_agent_action` → PtyService.approvePending() writes command to PTY
- Reject: invokes `reject_agent_action` → PtyService.rejectPending() discards command
- IPC channels: `approve_agent_action`, `reject_agent_action` (invoke), `agent-approval-request` (event)
- Toaster: sonner + ThemedToaster component (reads theme from ThemeContext), glassmorphism styling

## NEXT UP
- Test all features after migration (manual QA)
- Package and test .exe installer (electron-builder)
- Workspace Tabs: multi-project tabs with per-tab canvas isolation

# Orchestrated Space Napkin

## IDENTIDADE
Orchestrated Space = Sistema Operacional de Orquestracao para Devs Senior.
Canvas infinito (estilo n8n/Raycast) onde VS Code, Terminais PTY, Browsers e Notas coexistem e se comunicam.
Renomeado: Shark Canvas → Maestri-X → Orchestrated Space (2026-04-15).
Nomes internos preservados: maestriAPI, %APPDATA%/maestri-x/, maestri-x.db.

## STACK ATUAL (2026-04-17)
- **Backend**: Electron main process (Node.js/TypeScript), 11 services
- **Frontend**: React 18 + TypeScript + Vite
- **Canvas**: React Flow 12.6 (12 node types, circuit routing edges)
- **State**: Zustand + SQLite (better-sqlite3), auto-save 2s debounce
- **Terminais**: xterm.js + node-pty (useConpty: true)
- **UI**: Tailwind + Glassmorphism + Inter/JetBrains Mono
- **Brand**: Purple #A855F7 (accent), Cyan #22D3EE (secondary)
- **BrowserNode**: Electron `<webview>` tag (NO iframe, NO proxy)
- **Header bypass**: session.webRequest (strips X-Frame-Options/CSP) — used by VSCodeNode iframe
- **Logging**: electron-log v5 (file + console, 5MB rotation)
- **IPC Bridge**: `window.maestriAPI` via contextBridge (typed in `src/global.d.ts`)
- **AI Routing**: Direct Backend Routing v3 (TranslatorService parses SEND_TO, dispatches to PTYs)
- **CWD Sync**: useCwdCascade hook (reactive path cascade between connected nodes)

## ARQUITETURA

### Backend (electron/)
10 services em `electron/services/`, 38 IPC handlers em `electron/ipc/handlers.ts`
- PtyService: node-pty + 8KB ring buffer + 16ms coalesce + writeString() atomic write
- PersistenceService: better-sqlite3 WAL mode, prepared statements
- ContextService: Maestro Bus (graph diff, action dispatch)
- CodeServerService: VS Code serve-web spawn, TCP readiness, tree-kill cleanup
- VaultService: fs.readdir/readFile + path traversal prevention
- SupervisorService: cleanup coordinator (PTY + code-server)
- TranslatorService: AI call + SEND_TO tag parser + PTY dispatch (Direct Backend Routing v3)
- MonitorService: os.cpus/freemem + delta CPU
- FileSystemService: stateless FS reader, safeResolve, 1MB limit

### Frontend (src/)
- Zustand store: `src/store/canvasStore.ts` (14 addNode helpers, all accept optional position)
- Auth gate: `src/store/authStore.ts` (sessionStorage, UI-only)
- Custom hooks: `src/hooks/use*.ts` (useCwdCascade, useSwarmRouter, usePty, etc.)
- 13 node types: terminal, note, vscode, obsidian, browser, kanban, api, db, monaco, workspace, markdown, architect, group
- Command Palette: cmdk, Ctrl+K/Cmd+K
- Edge validation: magnetic (any-to-any except self-loops)
- All nodes: 4 universal handles (Top/Bottom/Left/Right) with unique IDs

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
- node-pty e better-sqlite3: native addons, MUST electron-rebuild after npm install
- strip-ansi pinned to v6 (last CJS; v7+ ESM-only)
- pty.spawn() second arg MUST be `[]` literal (C++ binding crashes otherwise)
- useConpty MUST be true (winpty removed from electron-rebuild)
- memo() em todos os nodes para React Flow virtualization
- useShallow() em seletores de array (zustand/react/shallow)
- Edge direction is user choice: ALWAYS use bidirectional lookup `e.source === id || e.target === id`
- Every early-return in click handlers MUST have console.log + user feedback
- Zustand `getState()` at call-time > backend stale cache
- useCwdCascade: hook = graph state only, terminal useEffect = live shell (separation of concerns)
- TranslatorService: prompt blocks all text outside SEND_TO tags + sanitizer strips non-tag lines
- PTY dispatch: split write (text first, \x0D after 50ms) for CLI raw mode compatibility
- Logging: `import log from "../log"` in all electron services, NEVER console.log in electron/
- Handle hitboxes: unique IDs (top/bottom/left/right), ::before pseudo-element inset:-8px, zIndex:50
- NodeWrapper: overflow-hidden on content div (not wrapper root), handles project outside

## COMPONENTES PROTEGIDOS
- `electron/ipc/handlers.ts` — IPC surface, changes affect entire app
- `electron/services/ContextService.ts` — Maestro Bus graph diff logic
- `electron/services/TranslatorService.ts` — AI routing + SEND_TO dispatch
- `src/store/canvasStore.ts` — Zustand global state + auto-save
- `src/hooks/usePty.ts` — PTY lifecycle (listen/unlisten timing)
- `src/hooks/useCwdCascade.ts` — Reactive CWD propagation between nodes

## COMPLETED
- Fase 1-10: All Tauri-era features + Electron Migration (2026-04-14)
- VS Code fixes (2026-04-15): zombie kill, folder path, extensions-dir removal
- PTY fixes (2026-04-15): spawn safe defaults, useConpty:true, COMSPEC shell
- Smart Context v1-v2 (2026-04-15): VSCode→Terminal auto-cd, VSCode→Browser auto-URL
- Webview refactor (2026-04-15): BrowserNode iframe→webview, URL sync
- Performance (2026-04-15): useShallow, getEdges on-demand, NodeErrorBoundary
- Kanban DnD (2026-04-15): @hello-pangea/dnd, cross-column drag, column colors
- Enterprise Foundation (2026-04-15): maestriAPI bridge, electron-log, inline rename
- UX Polish (2026-04-15): save indicator, settings cog, conpty filter
- PTY-Broadcast + HITL (2026-04-15): [BROADCAST]/[ASK_APPROVAL] tokens, sonner toasts
- Premium Canvas (2026-04-15): radial glow, refined dot grid
- Monaco Spatial IDE (2026-04-15): MonacoNode + FileSystemService + FileExplorer
- Rebranding (2026-04-15): Maestri-X → Orchestrated Space, accent #A855F7
- Auth Gateway (2026-04-15): LoginScreen + authStore (sessionStorage)
- File Icons (2026-04-15): FileIcon component with lucide-react (50+ mappings)
- Universal Handles (2026-04-15): All 12 node types with 4 handles (T/B/L/R)
- NativeWorkspaceNode (2026-04-15): File Tree + Monaco hybrid node, teal #14b8a6
- Frontend 2.0 (2026-04-15): Circuit routing, MiniMap, MarkdownNode, Command Palette, Spatial Nav
- Deep CWD Sync (2026-04-16): useCwdCascade hook, reactive path cascade
- Live CD Fix (2026-04-16): TerminalNode useEffect watches data.cwd, `cd /d` + cls
- Direct Backend Routing v3 (2026-04-16): TranslatorService SEND_TO parser, PTY dispatch, -305 lines dead code
- Handle Hitbox Fix (2026-04-16): unique handle IDs, ::before hitbox, zIndex:50
- Ghost Effect Fix (2026-04-16): magnetic edges (any-to-any), overflow-hidden on content div
- Persona Architect (2026-04-23): 3-phase AI onboarding modal (Interview→Template→Dossier), PersonaArchitectService, triggered from ProjectGroupNode
- Task Manager + Watcher (2026-04-23): KanbanNode rewritten as flat task list with TaskItem (id/title/status/dueDate), status cycling (TODO→DOING→DONE), overdue/today visuals, useTaskWatcher fires toasts every 60s for non-DONE tasks
- Architect Node (2026-04-23): ArchitectNode canvas node — LLM chat interview, CWD cascade support
- Multi-Agent Personas (2026-04-23): Architect generates SEPARATE persona files per domain (frontend_persona.md, backend_persona.md). XML `<file name="...">` tags parsed by regex. Batch save to cwd. Individual ignition prompts per terminal. System prompt teaches domain separation to avoid hallucinations. maxTokens bumped 4000→8000
- Auto-Ignicao (2026-04-23): Agent button in TerminalNode boots Claude CLI + injects persona prompt after 4s delay. Label→filename: "Frontend" → "frontend_persona.md". Split write (text + 50ms \x0D) for CLI raw mode. State machine: idle→booting→injecting→ready. Toast feedback + animated button states

## NEXT UP
- **QA: Delayed Enter dispatch (2026-04-21)**: Testar se o `\x0D` com 50ms delay executa no Claude Code CLI. Se não funcionar, tentar: aumentar delay (100-200ms), usar `\n` em vez de `\x0D`, ou sequência `\x0D\x0A`
- Manual QA: test all features end-to-end after all fixes
- Package .exe installer (electron-builder)
- Workspace Tabs: multi-project tabs with per-tab canvas isolation

# Maestri-X Napkin

## IDENTIDADE
Maestri-X = Sistema Operacional de Orquestracao para Devs Senior.
Canvas infinito (estilo n8n/Raycast) onde VS Code, Terminais PTY, Browsers e Notas coexistem e se comunicam.

## STACK ATUAL (2026-04-14)
- **Backend**: Electron main process (Node.js/TypeScript)
- **Frontend**: React 18 + TypeScript + Vite
- **Canvas**: React Flow 12.6
- **State**: Zustand + SQLite (better-sqlite3)
- **Terminais**: xterm.js + node-pty
- **UI**: Tailwind + Glassmorphism + Inter/JetBrains Mono
- **Proxy**: Express 13333 (localhost only, path-based routing)
- **Header bypass**: Electron session.webRequest (strips X-Frame-Options/CSP)

## ARQUITETURA

### Backend (electron/)
9 services em `electron/services/`, 32 IPC handlers em `electron/ipc/handlers.ts`
- PtyService: node-pty + 8KB ring buffer + 16ms coalesce
- ProxyService: Express 13333, `/proxy/:instanceId/` (localhost only)
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
- External URLs: iframe direto, Electron session strips headers
- Localhost URLs: proxy via Express 13333

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

## NEXT UP
- Test all features after migration (manual QA)
- Package and test .exe installer (electron-builder)
- Workspace Tabs: multi-project tabs with per-tab canvas isolation

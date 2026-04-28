<div align="center">

# ORCHESTRATOR

**I got tired of alt-tabbing between 12 windows to do my job. So I built this.**

[![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React Flow](https://img.shields.io/badge/React_Flow-12.6-FF0072?logo=reactflow&logoColor=white)](https://reactflow.dev/)
[![License](https://img.shields.io/badge/License-Proprietary-A855F7)](#license)

<br/>

[Download](#download) | [Why This Exists](#why-this-exists) | [What You Get](#what-you-get) | [How It Works](#how-it-works) | [Architecture](#architecture) | [Getting Started](#getting-started) | [Portugues](README.pt-BR.md)

</div>

---

## Download

**Windows (x64)** -- grab the latest build from [GitHub Releases](https://github.com/mauricioreiss/Orchestrator/releases).

| File | Description |
|------|-------------|
| `Orchestrator Setup 0.2.0.exe` | Installer (recommended) |
| `Orchestrator 0.2.0.exe` | Portable, no install needed |

> Requires Windows 10/11. macOS and Linux support planned.

---

## Why This Exists

I'm Mauricio. I've been shipping software professionally for years, and my daily setup looks something like this: 3 terminals running AI agents, 2 VS Code windows, a kanban board, an API client, log files in notepad, and a browser with 40 tabs. All disconnected. All fighting for screen space.

Every single day I copy-paste paths between terminals. I alt-tab to check which agent finished. I manually `cd` into the right folder after opening a new shell. I lose track of which terminal is waiting for a `y/n` confirmation while I'm reading logs in another window.

That's not a workflow. That's overhead.

So I built ORCHESTRATOR. One infinite canvas. Every tool I need lives there as a node. I draw edges between them, and context flows automatically. Terminal gets the right working directory. AI agents know about each other. I see every process status at a glance without touching alt-tab.

**This is the tool I wanted to exist.** It didn't, so I made it.

---

## What You Get

### 13 node types on a single canvas

Everything a senior engineer uses daily, in one place:

| Node | Why it's there |
|------|---------------|
| **Terminal** | Real PTY shell (PowerShell/bash) with xterm.js. Not a toy -- it runs node-pty underneath, same as VS Code's integrated terminal. Role badges, boot queues, output piping. |
| **Note** | The brain. Write "run tests on backend, lint the frontend" in plain text, connect it to the right terminals, hit send. The AI parses your intent and dispatches each command to the correct shell. One click replaces 4 copy-pastes. |
| **VS Code** | Full VS Code Server embedded in the canvas. Not a stripped-down editor -- the real thing with extensions, git, debugger. Pick a folder, get an IDE. |
| **Architect** | AI interview that asks about your project (stack, auth, business rules, CI/CD) and generates domain-specific persona files. Inject them into terminals so each AI agent has clear boundaries: backend agent stays in backend, frontend agent stays in frontend. |
| **Workspace** | File tree + Monaco editor in one node. For when you need to browse and quick-edit without spinning up a full VS Code instance. |
| **Git** | Visual git status with color-coded files. One-click commit. Two-stage emergency revert (arm, confirm, execute) so you don't accidentally `git reset --hard` your afternoon's work. |
| **Log Viewer** | Real-time file tailing. Matrix-style green-on-black. Pause, resume, clear, 10k line cap. Detects log rotation automatically. |
| **Markdown** | Edit/preview toggle with GitHub-flavored rendering. Use it as a scratch pad, output viewer, or documentation node. |
| **Kanban** | Task board with drag-and-drop, due dates, overdue alerts. Stays on the canvas next to the code it refers to. |
| **API Client** | HTTP requests (GET/POST/PUT/DELETE/PATCH) with headers, body, and live response. No need to open Postman. |
| **Database** | SQL query editor with result display. Parameterized queries only -- no string concatenation, ever. |
| **Monaco Editor** | Standalone code editor when you just need syntax highlighting without the VS Code overhead. |
| **Project Group** | Visual container to organize nodes. Color-coded, collapsible. Navigate between projects with smooth zoom transitions. |

### AI multi-agent dispatch that actually works

This is the part that changes your workflow the most.

Connect a Note to 3 terminals labeled "Backend", "Frontend", and "DevOps". Write what you want in plain language. The AI reads every terminal's label and working directory, figures out which command goes where, and writes directly to each PTY.

No clipboard. No tab-switching. No "let me paste this in the right terminal."

Multi-hop chains work too: Note &rarr; VS Code &rarr; Terminal. The terminal inherits the VS Code workspace path automatically.

### Context propagation that eliminates manual setup

Connect a VS Code node to a Terminal. The terminal `cd`s into the workspace folder. Change the folder in VS Code, and every connected terminal follows.

Edge direction doesn't matter. Draw it however makes sense to you. The system handles both directions.

This sounds small until you realize how many times per day you type `cd /path/to/project` after opening a new terminal.

### Terminal status monitoring across your entire canvas

Every terminal shows its state in real time:

| Status | Visual | What it means |
|--------|--------|---------------|
| **Active** | Blue pulse | Something is running |
| **Awaiting Approval** | Yellow pulse + red blink | A CLI is asking for input (y/n, password, confirmation) |
| **Idle** | Green glow | Done. Terminal is free. |

The GlobalStatusHUD groups all terminals by project in a fixed panel. Click any entry to fly directly to that terminal on the canvas. When the app is in the background, you get native OS notifications for completed tasks and approval requests.

No more guessing. No more alt-tabbing to check.

### Command Palette (Ctrl+K)

Create nodes, search and jump to existing ones, run slash commands (`/kill-all`, `/add-terminal`, `/add-git`, `/add-log`), navigate between project groups. Keyboard-driven, fast.

Nodes spawn at viewport center with collision avoidance. No manual repositioning.

---

## How It Works

```
+-------------------+          IPC (45 commands)         +-------------------+
|                   |  <-------------------------------> |                   |
|    React SPA      |        window.maestriAPI            |   Electron Main   |
|                   |        (contextBridge)              |                   |
|  - React Flow     |                                    |  - PtyService     |
|  - Zustand Store  |                                    |  - TranslatorSvc  |
|  - xterm.js       |                                    |  - PersistenceSvc |
|  - Monaco Editor  |                                    |  - CodeServerSvc  |
|  - Framer Motion  |                                    |  - ArchitectSvc   |
|                   |                                    |  - FileSystemSvc  |
+-------------------+                                    +-------------------+
        |                                                         |
        |  Zustand (graph state)                                  |  SQLite (WAL mode)
        |  Auto-save with 2s debounce                             |  better-sqlite3
        v                                                         v
   Canvas State                                             maestri-x.db
   (nodes, edges,                                          (canvas, settings,
    viewport)                                               API keys encrypted)
```

**Design decisions and why:**

- **Frontend owns the graph.** Zustand is the source of truth for nodes, edges, and viewport. The backend syncs via debounced IPC snapshots. This keeps the canvas responsive regardless of what the backend is doing.
- **Backend owns the processes.** PTY spawning, AI calls, file I/O, and persistence run in the Electron main process. Full Node.js access, no sandbox limitations.
- **Typed IPC bridge.** Every command goes through `window.maestriAPI`, typed in `global.d.ts`, whitelisted in `preload.ts`. No raw `ipcRenderer` exposed to the renderer process.
- **API keys encrypted at rest** using Electron's `safeStorage` (DPAPI on Windows). Not in plaintext, not in localStorage, not in a JSON file.

---

## Architecture

```
src/
  components/
    Canvas.tsx              # React Flow canvas + 13 node types
    Sidebar.tsx             # Node creation + project navigation
    CommandPalette.tsx      # Ctrl+K quick actions + slash commands
    GlobalStatusHUD.tsx     # Terminal status monitor panel
    LoginScreen.tsx         # Splash screen
    nodes/                  # 13 specialized node components
    edges/
      FlowEdge.tsx          # Circuit-style routing + status animations
  store/
    canvasStore.ts          # Zustand: graph state + 14 addNode helpers
  hooks/
    useCwdCascade.ts        # Reactive CWD propagation
    useSwarmRouter.ts       # Edge flash animations on AI dispatch
    usePty.ts               # Terminal lifecycle management

electron/
  main.ts                   # BrowserWindow, service init, security headers
  preload.ts                # contextBridge with channel whitelisting
  ipc/
    handlers.ts             # 45 IPC command handlers
  services/
    PtyService.ts           # node-pty wrapper + status detection
    TranslatorService.ts    # AI orchestration + SEND_TO dispatch
    PersistenceService.ts   # SQLite + encrypted settings
    CodeServerService.ts    # VS Code Server lifecycle
    ArchitectService.ts     # LLM interview + persona generation
    FileSystemService.ts    # Safe FS reader (path traversal prevention)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop** | Electron 41 |
| **Frontend** | React 18 + TypeScript 5.6 |
| **Canvas** | React Flow 12.6 |
| **Terminal** | xterm.js 5.5 + node-pty 1.1 |
| **Editor** | Monaco Editor 4.7 |
| **VS Code** | code-server (serve-web) |
| **State** | Zustand 5 |
| **Database** | better-sqlite3 12.9 (SQLite, WAL mode) |
| **AI** | OpenAI / Anthropic API |
| **Animations** | Framer Motion 12 |
| **UI** | Tailwind CSS + custom glassmorphism design system |
| **Build** | Vite 5 + electron-builder |

---

## Getting Started

### Prerequisites

- Node.js 18+
- VS Code installed (for the embedded VS Code Server node)
- Windows 10/11

### Install and run

```bash
git clone https://github.com/mauricioreiss/Orchestrator.git
cd Orchestrator
npm install
npm run electron:dev
```

### Build the .exe

```bash
npm run dist
```

Output goes to `release/` (installer + portable).

---

## Roadmap

- [x] 13 node types with universal handles
- [x] AI multi-agent dispatch (Note &rarr; Terminals)
- [x] CWD cascade between connected nodes (bidirectional)
- [x] Terminal status monitor + native OS notifications
- [x] Architect AI interview + persona generation
- [x] Command Palette with slash commands
- [x] Auto-save to SQLite
- [x] Git node with one-click commit and emergency revert
- [x] Log viewer with real-time file tailing
- [x] Windows .exe build (NSIS + portable)
- [ ] Workspace Tabs (multi-project isolation)
- [ ] Plugin system for custom node types
- [ ] macOS and Linux support
- [ ] Collaborative canvas (multiplayer)

---

<div align="center">

Built by [Mauricio](https://github.com/mauricioreiss)

**ORCHESTRATOR** -- Alpha (v0.2.0)

</div>

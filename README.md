<div align="center">

# Orchestrated Space

**The visual operating system for developers who orchestrate AI agents.**

A desktop canvas where terminals, code editors, AI agents, and dev tools live side by side,
connected by edges that carry context, commands, and intelligence between them.

[![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React Flow](https://img.shields.io/badge/React_Flow-12.6-FF0072?logo=reactflow&logoColor=white)](https://reactflow.dev/)
[![License](https://img.shields.io/badge/License-Proprietary-A855F7)](#license)

<br/>

[Features](#features) | [How It Works](#how-it-works) | [Architecture](#architecture) | [Getting Started](#getting-started) | [Roadmap](#roadmap)

<br/>

> Think **n8n meets VS Code meets a multi-agent terminal orchestrator** -- all on an infinite canvas.

</div>

---

## The Problem

Modern development with AI agents is chaos:

- **Tab hell.** 6 terminals, 3 editors, a browser, a kanban board -- scattered across your taskbar.
- **Context is manual.** You copy-paste paths, commands, and outputs between windows. The tools don't know about each other.
- **AI agents are blind.** Claude, GPT, Copilot -- they run in isolated terminals with no awareness of what other agents are doing, what project they're in, or what the others already tried.
- **No visibility.** Which terminal finished? Which one is waiting for approval? You alt-tab and guess.

## The Solution

Orchestrated Space puts everything on a single infinite canvas. You draw edges between nodes, and the system propagates context, dispatches AI commands, and monitors status automatically.

**One screen. Full awareness. Zero tab-switching.**

---

## Features

### Visual Node Canvas

Drag, connect, and orchestrate 11 specialized node types on an infinite canvas with magnetic edges, circuit-style routing, and glassmorphism UI.

| Node | What it does |
|------|-------------|
| **Terminal** | Live PTY shell (PowerShell/bash) with xterm.js. Supports role badges, boot queues, and output piping between terminals. |
| **Note** | The orchestrator hub. Write a command in natural language, connect it to terminals, and the AI figures out which terminal gets which command. |
| **VS Code** | Full VS Code Server embedded in the canvas. Pick a folder, get a complete IDE -- syntax highlighting, extensions, git, everything. |
| **Architect** | AI-powered project interview. It asks about your stack, requirements, and constraints, then generates domain-specific agent personas (backend, frontend, security) ready to inject into terminals. |
| **Workspace** | File tree + Monaco editor in a single node. Browse, open, and edit files without leaving the canvas. |
| **Markdown** | Smart output panel with edit/preview toggle. GitHub-flavored markdown with full prose styling. |
| **Kanban** | Task board with drag-and-drop columns, priority colors, due dates, and overdue alerts. |
| **API Client** | HTTP request builder (GET/POST/PUT/DELETE/PATCH) with headers, body, and live response display. |
| **Database** | SQL query editor with result display. Parameterized queries only. |
| **Monaco Editor** | Standalone code editor with syntax highlighting and file tree navigation. |
| **Project Group** | Visual container to organize nodes by project. Custom colors, spatial navigation, and group-level actions. |

### AI-Powered Multi-Agent Orchestration

The core differentiator. Connect a **Note** node to multiple **Terminal** nodes, write what you want in plain language, and the AI dispatches the right command to the right terminal.

```
                    +-----------+
                    |   Note    |
                    | "Run the  |
                    |  tests on |
                    |  backend, |
                    |  lint the  |
                    |  frontend" |
                    +-----+-----+
                          |
              +-----------+-----------+
              |                       |
      +-------v-------+     +--------v------+
      |   Terminal 1   |     |   Terminal 2   |
      |   "Backend"    |     |   "Frontend"   |
      |  cwd: /api     |     |  cwd: /web     |
      |                |     |                |
      | > npm test     |     | > npm run lint |
      +----------------+     +----------------+
```

**How it works under the hood:**

1. The Note node collects all connected terminal labels and their working directories
2. Sends everything to the AI backend (OpenAI or Anthropic)
3. The AI returns structured `<<SEND_TO:label>> command` tags
4. The backend parses the tags and writes each command directly to the correct PTY
5. Edges flash with status animations (translating, success, error)
6. No copy-paste. No tab-switching. One click.

**Multi-hop resolution:** Note &rarr; VS Code &rarr; Terminal chains work too. The terminal inherits the VS Code workspace path as its working directory automatically.

### Deep Context Propagation

Nodes don't just sit on a canvas. They **talk to each other** through edges.

- **CWD cascade:** Connect a VS Code node to a Terminal, and the terminal automatically `cd`s into the workspace folder. Change the VS Code path, and every connected terminal follows.
- **Bidirectional:** Edge direction doesn't matter. Draw Terminal&rarr;Note or Note&rarr;Terminal -- the system handles both.
- **Reactive:** When a source node's path changes, the cascade fires automatically to all downstream nodes. No manual sync.

### Real-Time Terminal Status Monitor

Every terminal reports its state in real time:

| Status | Visual | Meaning |
|--------|--------|---------|
| **Active** | Blue pulse | Command is running |
| **Awaiting Approval** | Yellow pulse + red blink | CLI is asking for input (y/n, password, confirmation) |
| **Idle** | Green glow | Command finished, terminal is free |

- **GlobalStatusHUD:** A fixed panel that groups all terminals by project, shows status dots, and lets you click to navigate directly to any terminal on the canvas.
- **Native notifications:** When the app is in the background, you get OS-level alerts for completed tasks and approval requests.
- **Auto-reset:** Status clears automatically when you start typing in a terminal.

### Architect: AI Project Scaffolding

The **Architect** node conducts a structured interview about your project:

1. **Goal** -- What are you building?
2. **Stack** -- What technologies?
3. **State & Auth** -- How do you handle data and access?
4. **Business rules** -- What domain constraints exist?
5. **Structure** -- Monorepo? Microservices?
6. **CI/CD** -- How do you deploy?

Then it generates **domain-specific persona files** (e.g., `backend_persona.md`, `frontend_persona.md`, `security_persona.md`) that you can inject into terminals to give each AI agent a focused role with clear boundaries.

### Command Palette & Smart Spawn

`Ctrl+K` opens a command palette (powered by [cmdk](https://cmdk.paco.me/)) for quick actions:

- Create any node type instantly at viewport center
- Navigate to any project group with smooth zoom transitions
- Toggle settings and themes

Nodes spawn with **collision avoidance** -- no overlapping, no manual repositioning.

---

## How It Works

```
+-------------------+          IPC (39 commands)         +-------------------+
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

**Key design decisions:**

- **Frontend owns the graph.** Zustand store is the source of truth for nodes, edges, and viewport. Backend syncs via debounced IPC snapshots.
- **Backend owns the processes.** PTY spawning, AI calls, file I/O, and persistence all run in the Electron main process with full Node.js access.
- **Typed IPC bridge.** Every command goes through `window.maestriAPI`, typed in `global.d.ts`, whitelisted in `preload.ts`. No raw `ipcRenderer` exposure.
- **API keys encrypted at rest** using Electron's `safeStorage` (DPAPI on Windows).

---

## Architecture

```
src/
  components/
    Canvas.tsx              # React Flow canvas + 11 node types
    Sidebar.tsx             # Node creation + project navigation
    CommandPalette.tsx      # Ctrl+K quick actions
    GlobalStatusHUD.tsx     # Terminal status monitor panel
    LoginScreen.tsx         # Glassmorphism splash screen
    nodes/                  # 11 specialized node components
    edges/
      FlowEdge.tsx          # Circuit-style routing + status animations
  store/
    canvasStore.ts          # Zustand: graph state + 12 addNode helpers
  hooks/
    useCwdCascade.ts        # Reactive CWD propagation between nodes
    useSwarmRouter.ts       # Edge flash animations on AI dispatch
    usePty.ts               # Terminal lifecycle management

electron/
  main.ts                   # BrowserWindow, service init, security headers
  preload.ts                # contextBridge with channel whitelisting
  ipc/
    handlers.ts             # 39 IPC command handlers
  services/
    PtyService.ts           # node-pty wrapper + status detection
    TranslatorService.ts    # AI orchestration + SEND_TO dispatch
    PersistenceService.ts   # SQLite + encrypted settings
    CodeServerService.ts    # VS Code Server lifecycle
    ArchitectService.ts     # LLM interview + persona generation
    FileSystemService.ts    # Safe FS reader (path traversal prevention)
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Desktop** | Electron 41 | Full Node.js access for PTY, SQLite, filesystem |
| **Frontend** | React 18 + TypeScript 5.6 | Type-safe component architecture |
| **Canvas** | React Flow 12.6 | Production-grade node graph with handles, edges, minimap |
| **Terminal** | xterm.js 5.5 + node-pty 1.1 | Real OS-level shell, not a fake terminal |
| **Editor** | Monaco Editor 4.7 | VS Code's editor engine, standalone |
| **VS Code** | code-server (serve-web) | Full IDE embedded via iframe |
| **State** | Zustand 5 | Lightweight, no boilerplate, selector-based reactivity |
| **Database** | better-sqlite3 12.9 | Synchronous SQLite with WAL mode, Electron-safe |
| **AI** | OpenAI / Anthropic API | Multi-provider support for command translation |
| **Animations** | Framer Motion 12 | Physics-based transitions |
| **UI** | Tailwind CSS + Glassmorphism | Custom design system with dark/light themes |
| **Notifications** | sonner + Electron Notification | In-app toasts + native OS alerts |
| **Icons** | Lucide React | 50+ file-type-aware icons |
| **Build** | Vite 5 + electron-builder | Fast dev server + NSIS Windows installer |

---

## Getting Started

### Prerequisites

- Node.js 18+
- VS Code (for the embedded VS Code Server node)
- Windows 10/11 (macOS/Linux support planned)

### Install

```bash
git clone https://github.com/your-username/orchestrated-space.git
cd orchestrated-space
npm install
```

### Development

```bash
npm run electron:dev
```

This starts Vite (frontend hot-reload) and Electron concurrently.

### Build

```bash
npm run electron:build
```

Produces a Windows installer (`.exe`) in the `release/` directory.

### Type Check

```bash
npx tsc --noEmit              # Frontend
cd electron && npx tsc --noEmit  # Backend
```

---

## Roadmap

- [x] 11 node types with universal handles
- [x] AI multi-agent dispatch (Note &rarr; Terminals)
- [x] Deep CWD cascade between connected nodes
- [x] Terminal status monitor + native notifications
- [x] Architect AI interview + persona generation
- [x] Command Palette (Ctrl+K)
- [x] Auto-save to SQLite with visual indicator
- [x] Glassmorphism UI with dark/light themes
- [x] Smart spawn with collision avoidance
- [x] Circuit-style edge routing with status animations
- [ ] Workspace Tabs (multi-project isolation)
- [ ] Plugin system for custom node types
- [ ] macOS and Linux support
- [ ] Collaborative canvas (multiplayer)
- [ ] Marketplace for agent personas

---

## Design Philosophy

**Nodes are tools. Edges are context. The canvas is your brain.**

Every developer's workflow is a graph. You have a terminal that depends on a project folder. A test runner that depends on a build step. An AI agent that needs to know what the other agents already did. Orchestrated Space makes that graph explicit, visual, and executable.

No more alt-tabbing. No more copy-pasting paths. No more wondering which terminal finished.

Just connect the nodes and let the system do the wiring.

---

<div align="center">

Built by [Mauri](https://github.com/your-username) | Oduo Tech Team

**Orchestrated Space** is currently in **Alpha (v0.2.0)**.

</div>

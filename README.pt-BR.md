<div align="center">

# ORCHESTRATOR

**Orquestracao Dirigida por IA**

Um canvas desktop onde terminais, editores de codigo, agentes de IA e ferramentas de desenvolvimento coexistem lado a lado, conectados por arestas que propagam contexto, comandos e inteligencia entre eles.

[![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React Flow](https://img.shields.io/badge/React_Flow-12.6-FF0072?logo=reactflow&logoColor=white)](https://reactflow.dev/)
[![License](https://img.shields.io/badge/License-Proprietary-A855F7)](#licenca)

<br/>

[Download](#download) | [Funcionalidades](#funcionalidades) | [Como Funciona](#como-funciona) | [Arquitetura](#arquitetura) | [Primeiros Passos](#primeiros-passos) | [Roadmap](#roadmap)

<br/>

> Imagine **n8n + VS Code + um orquestrador multi-agente de terminais** -- tudo em um canvas infinito.

</div>

---

## Download

**Windows (x64)** -- baixe a versao mais recente em [GitHub Releases](https://github.com/mauricioreiss/Orchestrator/releases).

| Arquivo | Descricao |
|---------|-----------|
| `Orchestrator-Setup-*.exe` | Instalador NSIS (recomendado) |
| `Orchestrator-*-portable.exe` | Portatil, sem instalacao |

> Requer Windows 10/11. Suporte a macOS e Linux planejado.

---

## O Problema

Desenvolvimento moderno com agentes de IA e um caos:

- **Inferno de abas.** 6 terminais, 3 editores, um browser, um kanban -- espalhados pela barra de tarefas.
- **Contexto e manual.** Voce copia e cola caminhos, comandos e outputs entre janelas. As ferramentas nao se conhecem.
- **Agentes de IA sao cegos.** Claude, GPT, Copilot -- rodam em terminais isolados sem saber o que os outros agentes estao fazendo, em qual projeto estao, ou o que os outros ja tentaram.
- **Zero visibilidade.** Qual terminal terminou? Qual ta esperando aprovacao? Voce alt-tab e torce.

## A Solucao

O ORCHESTRATOR coloca tudo em um unico canvas infinito. Voce desenha arestas entre nos, e o sistema propaga contexto, despacha comandos de IA e monitora status automaticamente.

**Uma tela. Visao completa. Zero troca de abas.**

---

## Funcionalidades

### Canvas Visual de Nos

Arraste, conecte e orquestre 13 tipos de nos especializados em um canvas infinito com arestas magneticas, roteamento estilo circuito e UI glassmorphism.

| No | O que faz |
|----|-----------|
| **Terminal** | Shell PTY real (PowerShell/bash) com xterm.js. Suporta badges de papel, filas de boot e piping de output entre terminais. |
| **Note** | O hub orquestrador. Escreva um comando em linguagem natural, conecte a terminais, e a IA descobre qual terminal recebe qual comando. |
| **VS Code** | VS Code Server completo embarcado no canvas. Escolha uma pasta e tenha uma IDE completa -- syntax highlighting, extensoes, git, tudo. |
| **Architect** | Entrevista de projeto com IA. Pergunta sobre stack, requisitos e restricoes, depois gera personas de agente por dominio prontas pra injetar nos terminais. |
| **Workspace** | Arvore de arquivos + editor Monaco em um unico no. Navegue, abra e edite arquivos sem sair do canvas. |
| **Markdown** | Painel de output inteligente com toggle editar/preview. Markdown GitHub-flavored com estilizacao prose completa. |
| **Git** | Controle git visual. Status com cores (modificado, adicionado, deletado, untracked), commit com um clique, e revert de emergencia em dois estagios com desarme automatico. |
| **Log Viewer** | Tail de arquivos em tempo real com visual Matrix (verde sobre preto). Pause/resume, limite de 10k linhas, auto-scroll e deteccao de rotacao de log. |
| **Kanban** | Quadro de tarefas com drag-and-drop, cores de prioridade, datas de vencimento e alertas de atraso. |
| **API Client** | Construtor de requisicoes HTTP (GET/POST/PUT/DELETE/PATCH) com headers, body e resposta ao vivo. |
| **Database** | Editor de queries SQL com exibicao de resultados. Queries parametrizadas apenas. |
| **Monaco Editor** | Editor de codigo standalone com syntax highlighting e navegacao por arvore de arquivos. |
| **Project Group** | Container visual pra organizar nos por projeto. Cores customizadas, navegacao espacial e acoes em grupo. |

### Orquestracao Multi-Agente com IA

O diferencial principal. Conecte um no **Note** a varios nos **Terminal**, escreva o que quer em linguagem natural, e a IA despacha o comando certo pro terminal certo.

```
                    +-----------+
                    |   Note    |
                    | "Rode os  |
                    |  testes no|
                    |  backend, |
                    |  lint no   |
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

**Como funciona por baixo dos panos:**

1. O no Note coleta todos os labels e diretorios de trabalho dos terminais conectados
2. Envia tudo pro backend de IA (OpenAI ou Anthropic)
3. A IA retorna tags estruturadas `<<SEND_TO:label>> comando`
4. O backend parseia as tags e escreve cada comando direto no PTY correto
5. As arestas piscam com animacoes de status (traduzindo, sucesso, erro)
6. Sem copiar e colar. Sem trocar abas. Um clique.

**Resolucao multi-hop:** Cadeias Note &rarr; VS Code &rarr; Terminal tambem funcionam. O terminal herda automaticamente o workspace path do VS Code como diretorio de trabalho.

### Propagacao Profunda de Contexto

Os nos nao ficam parados no canvas. Eles **conversam entre si** atraves das arestas.

- **Cascata de CWD:** Conecte um no VS Code a um Terminal, e o terminal automaticamente faz `cd` pra pasta do workspace. Mude o path no VS Code, e todos os terminais conectados acompanham.
- **Bidirecional:** A direcao da aresta nao importa. Desenhe Terminal&rarr;Note ou Note&rarr;Terminal -- o sistema trata ambos.
- **Reativo:** Quando o path de um no muda, a cascata dispara automaticamente pra todos os nos conectados. Sem sync manual.

### Monitor de Status de Terminal em Tempo Real

Cada terminal reporta seu estado em tempo real:

| Status | Visual | Significado |
|--------|--------|-------------|
| **Ativo** | Pulso azul | Comando rodando |
| **Aguardando Aprovacao** | Pulso amarelo + blink vermelho | CLI pedindo input (y/n, senha, confirmacao) |
| **Ocioso** | Brilho verde | Comando terminou, terminal livre |

- **GlobalStatusHUD:** Painel fixo que agrupa todos os terminais por projeto, mostra dots de status, e permite clicar pra navegar direto ate qualquer terminal no canvas.
- **Notificacoes nativas:** Quando o app ta em background, voce recebe alertas do sistema operacional pra tarefas concluidas e pedidos de aprovacao.
- **Auto-reset:** O status limpa automaticamente quando voce comeca a digitar no terminal.

### Architect: Scaffolding de Projeto com IA

O no **Architect** conduz uma entrevista estruturada sobre seu projeto:

1. **Objetivo** -- O que voce ta construindo?
2. **Stack** -- Quais tecnologias?
3. **Estado e Auth** -- Como lida com dados e acesso?
4. **Regras de negocio** -- Quais restricoes de dominio existem?
5. **Estrutura** -- Monorepo? Microservicos?
6. **CI/CD** -- Como faz deploy?

Depois gera **arquivos de persona por dominio** (ex: `backend_persona.md`, `frontend_persona.md`, `security_persona.md`) que voce injeta nos terminais pra dar a cada agente de IA um papel focado com limites claros.

### Command Palette e Smart Spawn

`Ctrl+K` abre uma command palette (feita com [cmdk](https://cmdk.paco.me/)) pra acoes rapidas:

- Criar qualquer tipo de no instantaneamente no centro da viewport
- Buscar e focar nos existentes pelo nome
- Slash commands: `/kill-all`, `/add-terminal`, `/add-git`, `/add-log`
- Navegar ate qualquer grupo de projeto com transicao de zoom suave
- Alternar configuracoes e temas

Nos aparecem com **prevencao de colisao** -- sem sobreposicao, sem reposicionamento manual.

---

## Como Funciona

```
+-------------------+          IPC (45 comandos)         +-------------------+
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
        |  Zustand (estado do grafo)                              |  SQLite (modo WAL)
        |  Auto-save com debounce de 2s                           |  better-sqlite3
        v                                                         v
   Estado do Canvas                                          maestri-x.db
   (nos, arestas,                                           (canvas, configs,
    viewport)                                                chaves API criptografadas)
```

**Decisoes de design principais:**

- **Frontend e dono do grafo.** Zustand store e a fonte de verdade pra nos, arestas e viewport. Backend sincroniza via snapshots IPC com debounce.
- **Backend e dono dos processos.** Spawn de PTY, chamadas de IA, I/O de arquivos e persistencia rodam no processo principal do Electron com acesso total ao Node.js.
- **Bridge IPC tipada.** Todo comando passa por `window.maestriAPI`, tipada em `global.d.ts`, com whitelist em `preload.ts`. Sem `ipcRenderer` exposto.
- **Chaves de API criptografadas em repouso** usando `safeStorage` do Electron (DPAPI no Windows).

---

## Arquitetura

```
src/
  components/
    Canvas.tsx              # Canvas React Flow + 13 tipos de nos
    Sidebar.tsx             # Criacao de nos + navegacao de projetos
    CommandPalette.tsx      # Ctrl+K acoes rapidas + slash commands
    GlobalStatusHUD.tsx     # Painel monitor de status de terminais
    LoginScreen.tsx         # Tela splash glassmorphism
    nodes/                  # 13 componentes de nos especializados
    edges/
      FlowEdge.tsx          # Roteamento estilo circuito + animacoes de status
  store/
    canvasStore.ts          # Zustand: estado do grafo + 14 helpers addNode
  hooks/
    useCwdCascade.ts        # Propagacao reativa de CWD entre nos
    useSwarmRouter.ts       # Animacoes de flash nas arestas no dispatch de IA
    usePty.ts               # Gerenciamento de ciclo de vida do terminal

electron/
  main.ts                   # BrowserWindow, init de servicos, headers de seguranca
  preload.ts                # contextBridge com whitelist de canais
  ipc/
    handlers.ts             # 45 handlers de comandos IPC
  services/
    PtyService.ts           # Wrapper node-pty + deteccao de status
    TranslatorService.ts    # Orquestracao IA + dispatch SEND_TO
    PersistenceService.ts   # SQLite + configs criptografadas
    CodeServerService.ts    # Ciclo de vida do VS Code Server (singleton por workspace)
    ArchitectService.ts     # Entrevista LLM + geracao de personas
    FileSystemService.ts    # Leitor FS seguro (prevencao de path traversal)
```

---

## Stack Tecnologica

| Camada | Tecnologia | Por que |
|--------|-----------|---------|
| **Desktop** | Electron 41 | Acesso total ao Node.js pra PTY, SQLite, filesystem |
| **Frontend** | React 18 + TypeScript 5.6 | Arquitetura de componentes type-safe |
| **Canvas** | React Flow 12.6 | Grafo de nos production-grade com handles, arestas, minimap |
| **Terminal** | xterm.js 5.5 + node-pty 1.1 | Shell real do SO, nao um terminal falso |
| **Editor** | Monaco Editor 4.7 | Motor de editor do VS Code, standalone |
| **VS Code** | code-server (serve-web) | IDE completa embarcada via iframe |
| **Estado** | Zustand 5 | Leve, sem boilerplate, reatividade baseada em seletores |
| **Banco de Dados** | better-sqlite3 12.9 | SQLite sincrono com modo WAL, seguro pra Electron |
| **IA** | OpenAI / Anthropic API | Suporte multi-provider pra traducao de comandos |
| **Animacoes** | Framer Motion 12 | Transicoes baseadas em fisica |
| **UI** | Tailwind CSS + Glassmorphism | Design system customizado com temas dark/light |
| **Notificacoes** | sonner + Electron Notification | Toasts in-app + alertas nativos do SO |
| **Icones** | Lucide React | 50+ icones por tipo de arquivo |
| **Build** | Vite 5 + electron-builder | Dev server rapido + instalador NSIS pra Windows |

---

## Primeiros Passos

### Pre-requisitos

- Node.js 18+
- VS Code (pro no VS Code Server embarcado)
- Windows 10/11 (suporte macOS/Linux planejado)

### Instalacao

```bash
git clone https://github.com/mauricioreiss/Orchestrator.git
cd Orchestrator
npm install
```

### Desenvolvimento

```bash
npm run electron:dev
```

Inicia o Vite (hot-reload do frontend) e o Electron simultaneamente.

### Build

```bash
npm run dist
```

Gera um instalador Windows e um `.exe` portatil na pasta `release/`.

### Checagem de Tipos

```bash
npx tsc --noEmit              # Frontend
cd electron && npx tsc --noEmit  # Backend
```

---

## Roadmap

- [x] 13 tipos de nos com handles universais
- [x] Dispatch multi-agente com IA (Note &rarr; Terminais)
- [x] Cascata profunda de CWD entre nos conectados
- [x] Monitor de status de terminal + notificacoes nativas
- [x] Entrevista IA do Architect + geracao de personas
- [x] Command Palette com slash commands (Ctrl+K)
- [x] Auto-save em SQLite com indicador visual
- [x] UI Glassmorphism com temas dark/light
- [x] Smart spawn com prevencao de colisao
- [x] Roteamento de arestas estilo circuito com animacoes de status
- [x] No Git com commit em um clique e revert de emergencia
- [x] Log viewer com tail de arquivos em tempo real
- [x] Build Windows .exe (instalador NSIS + portatil)
- [ ] Workspace Tabs (isolamento multi-projeto)
- [ ] Sistema de plugins pra tipos de nos customizados
- [ ] Suporte macOS e Linux
- [ ] Canvas colaborativo (multiplayer)
- [ ] Marketplace de personas de agentes

---

## Filosofia de Design

**Nos sao ferramentas. Arestas sao contexto. O canvas e seu cerebro.**

O workflow de todo desenvolvedor e um grafo. Voce tem um terminal que depende de uma pasta de projeto. Um test runner que depende de um build step. Um agente de IA que precisa saber o que os outros agentes ja fizeram. O ORCHESTRATOR torna esse grafo explicito, visual e executavel.

Chega de alt-tab. Chega de copiar e colar caminhos. Chega de adivinhar qual terminal terminou.

Conecte os nos e deixe o sistema fazer a fiacao.

---

<div align="center">

Feito por [Mauri](https://github.com/mauricioreiss)

**ORCHESTRATOR** esta em **Alpha (v0.2.0)**.

</div>

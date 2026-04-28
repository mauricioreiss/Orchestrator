<div align="center">

# ORCHESTRATOR

**Cansei de alt-tab entre 12 janelas pra trabalhar. Entao eu construi isso.**

[![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React Flow](https://img.shields.io/badge/React_Flow-12.6-FF0072?logo=reactflow&logoColor=white)](https://reactflow.dev/)
[![License](https://img.shields.io/badge/License-Proprietary-A855F7)](#licenca)

<br/>

[Download](#download) | [Por Que Isso Existe](#por-que-isso-existe) | [O Que Voce Ganha](#o-que-voce-ganha) | [Como Funciona](#como-funciona) | [Arquitetura](#arquitetura) | [Primeiros Passos](#primeiros-passos) | [English](README.md)

</div>

---

## Download

**Windows (x64)** -- baixe a versao mais recente em [GitHub Releases](https://github.com/mauricioreiss/Orchestrator/releases).

| Arquivo | Descricao |
|---------|-----------|
| `Orchestrator Setup 0.2.0.exe` | Instalador (recomendado) |
| `Orchestrator 0.2.0.exe` | Portatil, sem instalacao |

> Requer Windows 10/11. Suporte a macOS e Linux planejado.

---

## Por Que Isso Existe

Meu nome e Mauricio. Eu trabalho com software ha anos, e meu setup diario e mais ou menos assim: 3 terminais rodando agentes de IA, 2 janelas do VS Code, um kanban, um client de API, arquivos de log abertos no notepad, e um browser com 40 abas. Tudo desconectado. Tudo brigando por espaco na tela.

Todo santo dia eu copio e colo caminhos entre terminais. Dou alt-tab pra ver qual agente terminou. Faco `cd` manual pra pasta certa depois de abrir um shell novo. Perco de vista qual terminal ta esperando um `y/n` enquanto leio logs em outra janela.

Isso nao e workflow. Isso e overhead.

Entao eu construi o ORCHESTRATOR. Um canvas infinito. Cada ferramenta que eu preciso vive ali como um no. Eu desenho arestas entre eles, e o contexto flui automaticamente. Terminal recebe o diretorio de trabalho certo. Agentes de IA sabem da existencia uns dos outros. Eu vejo o status de cada processo sem encostar no alt-tab.

**Essa e a ferramenta que eu queria que existisse.** Nao existia, entao eu fiz.

---

## O Que Voce Ganha

### 13 tipos de nos em um unico canvas

Tudo que um engenheiro senior usa no dia a dia, num lugar so:

| No | Por que ta ali |
|----|----------------|
| **Terminal** | Shell PTY real (PowerShell/bash) com xterm.js. Nao e brinquedo -- roda node-pty por baixo, o mesmo que o terminal integrado do VS Code. Badges de papel, filas de boot, piping de output. |
| **Note** | O cerebro. Escreva "rode os testes no backend, lint no frontend" em texto puro, conecte nos terminais certos, aperte enviar. A IA parseia sua intencao e despacha cada comando pro shell correto. Um clique substitui 4 copy-pastes. |
| **VS Code** | VS Code Server completo embarcado no canvas. Nao e um editor simplificado -- e o real, com extensoes, git, debugger. Escolha uma pasta, tenha uma IDE. |
| **Architect** | Entrevista com IA que pergunta sobre seu projeto (stack, auth, regras de negocio, CI/CD) e gera arquivos de persona por dominio. Injete nos terminais pra que cada agente de IA tenha limites claros: agente de backend fica no backend, agente de frontend fica no frontend. |
| **Workspace** | Arvore de arquivos + editor Monaco em um no. Pra quando voce precisa navegar e editar rapido sem subir uma instancia completa do VS Code. |
| **Git** | Status git visual com arquivos coloridos por tipo. Commit com um clique. Revert de emergencia em dois estagios (armar, confirmar, executar) pra voce nao dar `git reset --hard` no trabalho da tarde sem querer. |
| **Log Viewer** | Tail de arquivos em tempo real. Visual Matrix verde-sobre-preto. Pause, resume, limpar, limite de 10k linhas. Detecta rotacao de log automaticamente. |
| **Markdown** | Toggle editar/preview com renderizacao GitHub-flavored. Use como rascunho, viewer de output, ou no de documentacao. |
| **Kanban** | Quadro de tarefas com drag-and-drop, datas de vencimento, alertas de atraso. Fica no canvas do lado do codigo que ele referencia. |
| **API Client** | Requisicoes HTTP (GET/POST/PUT/DELETE/PATCH) com headers, body e resposta ao vivo. Sem precisar abrir Postman. |
| **Database** | Editor de queries SQL com exibicao de resultados. Queries parametrizadas -- sem concatenacao de string, nunca. |
| **Monaco Editor** | Editor de codigo standalone pra quando voce so precisa de syntax highlighting sem o peso do VS Code. |
| **Project Group** | Container visual pra organizar nos. Cores customizadas, colapsavel. Navegue entre projetos com transicao de zoom suave. |

### Dispatch multi-agente com IA que funciona de verdade

Essa e a parte que muda seu workflow.

Conecte um Note a 3 terminais rotulados "Backend", "Frontend" e "DevOps". Escreva o que quer em linguagem natural. A IA le o label e o diretorio de trabalho de cada terminal, descobre qual comando vai pra onde, e escreve direto em cada PTY.

Sem clipboard. Sem trocar aba. Sem "deixa eu colar isso no terminal certo."

Cadeias multi-hop tambem funcionam: Note &rarr; VS Code &rarr; Terminal. O terminal herda o workspace path do VS Code automaticamente.

### Propagacao de contexto que elimina setup manual

Conecte um no VS Code a um Terminal. O terminal faz `cd` na pasta do workspace. Mude a pasta no VS Code, e todo terminal conectado acompanha.

A direcao da aresta nao importa. Desenhe do jeito que fizer sentido pra voce. O sistema trata ambas as direcoes.

Parece pouco ate voce perceber quantas vezes por dia voce digita `cd /caminho/do/projeto` depois de abrir um terminal novo.

### Monitoramento de status em todo o canvas

Cada terminal mostra seu estado em tempo real:

| Status | Visual | O que significa |
|--------|--------|-----------------|
| **Ativo** | Pulso azul | Algo ta rodando |
| **Aguardando Aprovacao** | Pulso amarelo + blink vermelho | Um CLI ta pedindo input (y/n, senha, confirmacao) |
| **Ocioso** | Brilho verde | Terminou. Terminal livre. |

O GlobalStatusHUD agrupa todos os terminais por projeto em um painel fixo. Clique em qualquer entrada pra voar direto ate aquele terminal no canvas. Quando o app ta em background, voce recebe notificacoes nativas do SO pra tarefas concluidas e pedidos de aprovacao.

Chega de adivinhar. Chega de alt-tab pra conferir.

### Command Palette (Ctrl+K)

Criar nos, buscar e pular pra nos existentes, rodar slash commands (`/kill-all`, `/add-terminal`, `/add-git`, `/add-log`), navegar entre grupos de projeto. Orientado por teclado, rapido.

Nos aparecem no centro da viewport com prevencao de colisao. Sem reposicionamento manual.

---

## Como Funciona

```
+-------------------+         IPC (45 comandos)          +-------------------+
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

**Decisoes de design e por que:**

- **Frontend e dono do grafo.** Zustand e a fonte de verdade pra nos, arestas e viewport. O backend sincroniza via snapshots IPC com debounce. Isso mantem o canvas responsivo independente do que o backend ta fazendo.
- **Backend e dono dos processos.** Spawn de PTY, chamadas de IA, I/O de arquivo e persistencia rodam no processo principal do Electron. Acesso total ao Node.js, sem limitacoes de sandbox.
- **Bridge IPC tipada.** Todo comando passa por `window.maestriAPI`, tipada em `global.d.ts`, com whitelist em `preload.ts`. Nenhum `ipcRenderer` exposto pro renderer process.
- **Chaves de API criptografadas em repouso** usando `safeStorage` do Electron (DPAPI no Windows). Nao em texto puro, nao em localStorage, nao num arquivo JSON.

---

## Arquitetura

```
src/
  components/
    Canvas.tsx              # Canvas React Flow + 13 tipos de nos
    Sidebar.tsx             # Criacao de nos + navegacao de projetos
    CommandPalette.tsx      # Ctrl+K acoes rapidas + slash commands
    GlobalStatusHUD.tsx     # Painel monitor de status
    LoginScreen.tsx         # Tela splash
    nodes/                  # 13 componentes de nos especializados
    edges/
      FlowEdge.tsx          # Roteamento estilo circuito + animacoes de status
  store/
    canvasStore.ts          # Zustand: estado do grafo + 14 helpers addNode
  hooks/
    useCwdCascade.ts        # Propagacao reativa de CWD
    useSwarmRouter.ts       # Animacoes de flash no dispatch de IA
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
    CodeServerService.ts    # Ciclo de vida do VS Code Server
    ArchitectService.ts     # Entrevista LLM + geracao de personas
    FileSystemService.ts    # Leitor FS seguro (prevencao de path traversal)
```

## Stack Tecnologica

| Camada | Tecnologia |
|--------|-----------|
| **Desktop** | Electron 41 |
| **Frontend** | React 18 + TypeScript 5.6 |
| **Canvas** | React Flow 12.6 |
| **Terminal** | xterm.js 5.5 + node-pty 1.1 |
| **Editor** | Monaco Editor 4.7 |
| **VS Code** | code-server (serve-web) |
| **Estado** | Zustand 5 |
| **Banco de Dados** | better-sqlite3 12.9 (SQLite, modo WAL) |
| **IA** | OpenAI / Anthropic API |
| **Animacoes** | Framer Motion 12 |
| **UI** | Tailwind CSS + design system glassmorphism customizado |
| **Build** | Vite 5 + electron-builder |

---

## Primeiros Passos

### Pre-requisitos

- Node.js 18+
- VS Code instalado (pro no VS Code Server embarcado)
- Windows 10/11

### Instalar e rodar

```bash
git clone https://github.com/mauricioreiss/Orchestrator.git
cd Orchestrator
npm install
npm run electron:dev
```

### Buildar o .exe

```bash
npm run dist
```

Output vai pra `release/` (instalador + portatil).

---

## Roadmap

- [x] 13 tipos de nos com handles universais
- [x] Dispatch multi-agente com IA (Note &rarr; Terminais)
- [x] Cascata de CWD entre nos conectados (bidirecional)
- [x] Monitor de status de terminal + notificacoes nativas do SO
- [x] Entrevista IA do Architect + geracao de personas
- [x] Command Palette com slash commands
- [x] Auto-save em SQLite
- [x] No Git com commit em um clique e revert de emergencia
- [x] Log viewer com tail de arquivos em tempo real
- [x] Build Windows .exe (NSIS + portatil)
- [ ] Workspace Tabs (isolamento multi-projeto)
- [ ] Sistema de plugins pra tipos de nos customizados
- [ ] Suporte macOS e Linux
- [ ] Canvas colaborativo (multiplayer)

---

<div align="center">

Feito por [Mauricio](https://github.com/mauricioreiss)

**ORCHESTRATOR** -- Alpha (v0.2.0)

</div>

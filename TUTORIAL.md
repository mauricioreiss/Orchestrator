# Orchestrated Space — Tutorial

Guia prático de todas as funcionalidades do Orchestrated Space.

---

## Primeiros Passos

### Abrindo o App

Ao iniciar, você vê a tela de splash com o botão **"Iniciar Orquestrador"**. Clique para entrar no canvas. A sessão dura até fechar o app.

### O Canvas

O canvas é seu espaço de trabalho infinito. Aqui você cria nós, conecta-os com edges e monta seu ambiente de desenvolvimento.

**Controles básicos:**

| Ação | Como fazer |
|------|-----------|
| Mover o canvas | Arrastar com o mouse |
| Zoom | Scroll do mouse |
| Selecionar nó | Clique no nó |
| Mover nó | Arrastar o nó |
| Conectar nós | Arrastar de um handle (bolinha) até outro nó |
| Command Palette | `Ctrl+K` (Windows) ou `Cmd+K` (Mac) |

### Criando Nós

Três formas de criar nós:

1. **Sidebar** (barra lateral esquerda) — clique no botão do tipo desejado
2. **Command Palette** (`Ctrl+K`) — digite o nome do nó ou use `/add-terminal`, `/add-git`, `/add-log`
3. **Slash commands** no Command Palette — `/add-terminal`, `/add-git`, `/add-log`

Nós sempre aparecem no centro da tela. Se já houver um nó ali, o novo é posicionado ao lado automaticamente.

### Conectando Nós

Cada nó tem 4 handles (bolinhas de conexão): cima, baixo, esquerda, direita.

- Arraste de um handle até outro nó para criar uma edge (conexão)
- Qualquer nó conecta com qualquer outro (exceto consigo mesmo)
- A cor da edge muda conforme o tipo do nó de origem
- A direção da edge não importa para o funcionamento

---

## Os Nós

### Terminal (roxo #A855F7)

O nó principal. Abre um terminal PowerShell interativo dentro do canvas.

**O que faz:**
- Terminal completo com suporte a cores, cursor, autocomplete
- Recebe comandos de NoteNodes conectados (orquestração)
- Detecta status: ativo, aguardando aprovação, idle

**Controles:**

| Botão | Função |
|-------|--------|
| Badge de Role | Clique para mudar: Leader, Coder, Agent, CyberSec |
| Agent | Inicia o Claude CLI e injeta persona automaticamente |
| Auto | Liga/desliga aprovação automática de comandos |
| Pipe | Envia input dos terminais conectados |

**Status visual:**
- Borda amarela pulsando = aguardando aprovação
- Borda verde = tarefa concluída (idle)
- Bolinha verde no título = conectado ao PTY
- Bolinha vermelha = desconectado

**Smart Context:**
- Conecte um VS Code → o terminal herda o diretório de trabalho
- Conecte a uma Note em CMD mode → a Note pode enviar comandos para o terminal

---

### Note (âmbar #f59e0b)

Bloco de notas com dois modos: texto livre ou envio de comandos.

**Modos:**

| Modo | Badge | Para que serve |
|------|-------|---------------|
| TXT | Âmbar | Instruções, documentação, system prompts |
| CMD | Roxo | Enviar comandos para terminais conectados |

**Como usar:**
1. Clique no badge TXT/CMD para alternar o modo
2. Escreva no textarea
3. No modo CMD, clique **EXECUTE** para enviar o conteúdo aos terminais conectados

**Topologia:**
- Conecte a Note diretamente a Terminais
- Ou conecte Note → VS Code → Terminal (a Note encontra os terminais através do VS Code)

---

### VS Code (ciano #06b6d4)

Editor de código completo (VS Code Server) embutido no canvas.

**Como usar:**
1. Clique em **"Open Folder"** e selecione uma pasta
2. Aguarde o servidor iniciar (indicador "loading")
3. O VS Code aparece dentro do nó com tema dark

**Controles:**
- **Reconnect** — recarrega o iframe se a conexão cair
- **Stop** — encerra o servidor VS Code

**Smart Context:**
- Conecte a um Terminal → o terminal recebe o diretório do VS Code como cwd

---

### Markdown (cinza #64748b)

Editor markdown com preview ao vivo.

**Modos:**

| Modo | O que mostra |
|------|-------------|
| Edit | Textarea para escrever markdown |
| Preview | Markdown renderizado (títulos, listas, código, links) |

Clique no botão **Edit/Preview** no título para alternar.

Suporta GitHub Flavored Markdown: tabelas, checklists, blocos de código, etc.

---

### Architect (violeta #8b5cf6)

Entrevistador de IA que gera personas de equipe para seu projeto.

**Fluxo:**
1. O nó inicia com uma pergunta da IA sobre seu projeto
2. Responda no textarea e clique **Enviar** (ou Shift+Enter)
3. A IA faz perguntas graduais: objetivo → stack → estado → auth → regras de negócio → estrutura
4. Quando tiver informação suficiente, gera arquivos de persona (.md)
5. Clique **"Gerar Personas da Equipe"** para salvar no disco
6. Use os botões de copiar para injetar as personas nos terminais

**Requisito:** Conecte a um VS Code ou Terminal com diretório definido para que as personas sejam salvas no projeto.

---

### Git (rosa #f43f5e)

Controle visual do git com commit rápido e revert de emergência.

**Como usar:**
1. Clique **"Select Folder"** e escolha a pasta do repositório
2. Veja o status dos arquivos (modificados, adicionados, deletados, untracked)
3. Use os botões de ação

**Arquivos por cor:**

| Status | Cor | Significado |
|--------|-----|-------------|
| M | Âmbar | Modificado |
| A | Verde | Adicionado |
| D | Vermelho | Deletado |
| ?? | Cinza | Untracked |
| R | Ciano | Renomeado |

**Ações:**

| Botão | O que faz |
|-------|----------|
| Refresh | Atualiza o git status |
| Commit (verde) | `git add .` + commit com mensagem automática |
| Revert All (vermelho) | Reset total — **dois cliques** para confirmar |

**Segurança do Revert:**
1. Primeiro clique: arma o botão (muda para "CONFIRM RESET?")
2. Você tem 3 segundos para confirmar
3. Se não clicar de novo, desarma automaticamente
4. Segundo clique: executa `git reset --hard && git clean -fd`

---

### Log Viewer (verde #22c55e)

Tail de arquivos de log em tempo real, estilo Matrix.

**Como usar:**
1. Digite o caminho do arquivo ou clique **Browse**
2. O nó começa a exibir o conteúdo e acompanhar novas linhas em tempo real

**Visual:** Fundo preto, texto verde, fonte JetBrains Mono.

**Controles:**

| Botão | Função |
|-------|--------|
| Clear | Limpa todas as linhas exibidas |
| Pause | Pausa a captura (novas linhas são bufferizadas) |
| Resume | Retoma e exibe tudo que acumulou durante a pausa |

**Limites:**
- Máximo 10.000 linhas (as mais antigas são descartadas)
- Detecta rotação de log (quando o arquivo é truncado e recomeça)

---

### Tasks / Kanban (verde #10b981)

Gerenciador de tarefas simples com ciclo de status.

**Como usar:**
1. Digite o título da tarefa no campo inferior
2. Opcionalmente defina uma data de vencimento
3. Clique **Add** ou pressione Enter

**Ciclo de status:** Clique no badge de status para rotacionar:

```
TODO → DOING → DONE → TODO
```

**Alertas visuais:**
- Borda vermelha = tarefa vencida
- Borda amarela = vence hoje
- Texto riscado = tarefa concluída (DONE)

---

### API (laranja #f97316)

Cliente HTTP para testar endpoints direto no canvas.

**Como usar:**
1. Selecione o método (GET, POST, PUT, DELETE, PATCH)
2. Digite a URL
3. Adicione headers se necessário
4. Para POST/PUT/PATCH, escreva o body (JSON)
5. Clique **Send**

**Resposta:**
- Badge colorido com o status code (verde=2xx, âmbar=3xx, vermelho=4xx/5xx)
- Tempo de resposta em ms
- Body formatado com syntax highlight para JSON

---

### Database (azul #0ea5e9)

Executor de queries SQL com tabelas de exemplo.

**Tabelas disponíveis:** `users`, `orders`, `products`

**Como usar:**
1. Escreva uma query SQL (ex: `SELECT * FROM users LIMIT 10;`)
2. Pressione `Ctrl+Enter` ou clique **Run**
3. Resultado aparece em tabela formatada

---

### Vault / Obsidian (roxo #a855f7)

Navegador de vaults Obsidian (bases de conhecimento em markdown).

**Como usar:**
1. Digite o caminho da pasta do vault
2. Clique **Load**
3. Navegue pelas pastas e arquivos
4. Clique em um arquivo para preview

Tem busca integrada: digite 2+ caracteres para filtrar notas.

---

### Group / Projeto (cor customizável)

Container visual para organizar nós relacionados.

**Como usar:**
1. Crie um Group pela sidebar ou Command Palette
2. Arraste nós para dentro do grupo
3. Dê um nome clicando duas vezes no título
4. Escolha uma cor no seletor

**Funcionalidades:**
- Nós dentro do grupo se movem junto com ele
- Redimensionável pelos cantos (mínimo 600x400)
- Aparece na seção "Projects" da sidebar — clique para navegar até ele
- Botão de Persona Architect para gerar personas específicas do projeto

---

## Funcionalidades Globais

### Command Palette (`Ctrl+K`)

Hub central de comandos. Aceita:

| Tipo | Exemplos |
|------|---------|
| Slash commands | `/kill-all`, `/add-terminal`, `/add-git`, `/add-log` |
| Busca de nós | Digite o nome de um nó → clique para centralizar nele |
| Criar nós | Seção "Create" com todos os tipos |
| Navegar grupos | Seção "Navigate" lista todos os projetos |
| Configurações | Toggle de tema, abrir settings |

### SENTINELA (GlobalStatusHUD)

Painel fixo no canto inferior esquerdo que monitora todos os terminais.

**O que mostra:**
- Terminais agrupados por diretório de trabalho
- Status em tempo real com bolinha colorida:
  - Azul pulsando = ativo
  - Vermelho piscando = aguardando aprovação
  - Cinza = idle/desconectado

**Interação:**
- Clique em um terminal → o canvas centraliza nele
- Badge vermelho no título = quantidade de terminais aguardando aprovação
- Clique no header para expandir/recolher

### Sidebar

Barra lateral esquerda com:

1. **12 botões** para criar nós (um por tipo)
2. **Seção Projects** — lista de Groups para navegação rápida
3. **Indicador de save** — bolinha verde (salvo) ou âmbar pulsando (salvando)
4. **Botão Settings** — abre configurações do AI Provider
5. **Toggle de tema** — alterna entre dark e light mode

A sidebar pode ser recolhida clicando no ícone de menu (mostra apenas ícones).

### MiniMap

Mapa em miniatura no canto direito. Mostra todos os nós com cores por tipo. Você pode arrastar e dar zoom no minimap para navegar pelo canvas.

### Auto-Save

Todas as mudanças (posição dos nós, conteúdo, conexões) são salvas automaticamente no SQLite a cada 2 segundos. O indicador na sidebar mostra o status.

### Smart Context (Propagação Automática)

Quando você conecta nós, informações fluem automaticamente:

| De | Para | O que propaga |
|----|------|--------------|
| VS Code | Terminal | Diretório de trabalho (cwd) |
| Terminal | Terminal | Diretório de trabalho (cwd) |
| Note (CMD) | Terminal | Comandos via EXECUTE |
| Note | VS Code → Terminal | Comandos (multi-hop, encontra terminais através do VS Code) |

A propagação de diretório é bidirecional: funciona independente de qual direção você desenhou a edge.

### Notificações Nativas

Quando o app está minimizado ou em segundo plano:
- **"Tarefa Concluída"** — um terminal ficou idle
- **"Aprovação Necessária"** — um terminal precisa de input

---

## Workflow Típico

### Setup de projeto novo

1. Crie um **Group** e dê o nome do projeto
2. Dentro do grupo, crie um **VS Code** apontando para a pasta do projeto
3. Conecte um **Terminal** ao VS Code (herda o diretório)
4. Adicione uma **Note** para instruções/comandos
5. Opcionalmente: **Git** para controle de versão visual, **Log Viewer** para acompanhar logs

### Orquestração multi-terminal

1. Crie uma **Note** central no modo CMD
2. Conecte 2+ **Terminais** à Note
3. Escreva um comando na Note
4. Clique **EXECUTE** — o comando é enviado para todos os terminais conectados

### Geração de personas de equipe

1. Crie um **Architect** dentro de um Group
2. Conecte a um VS Code (para herdar o cwd)
3. Responda as perguntas da IA sobre seu projeto
4. Quando as personas forem geradas, salve no disco
5. Use o botão **Agent** nos terminais para injetar as personas automaticamente

---

## Atalhos Rápidos

| Atalho | Ação |
|--------|------|
| `Ctrl+K` / `Cmd+K` | Command Palette |
| `/kill-all` | Encerra todos os processos (terminais + VS Code servers) |
| `/add-terminal` | Cria terminal rápido |
| `/add-git` | Cria nó Git rápido |
| `/add-log` | Cria Log Viewer rápido |
| Clique na sidebar "Projects" | Navega até o grupo |
| Clique no SENTINELA | Centraliza no terminal |

# Ralph Loop Template

Dev autonomo com IA em loop. Cada iteracao = contexto limpo + 1 story implementada + commit.

Baseado em: https://github.com/snarktank/ralph

## Quando usar

- Tarefas com 5+ arquivos ou 3+ stories
- Projetos que levam mais de 1 sessao
- Quando o contexto do Claude comeca a degradar (muitas mudancas numa sessao)

## Quando NAO usar

- Fix de 1-2 arquivos (faz direto)
- Pesquisa/exploracao (usa o Claude normal)
- Projeto sem build command (sem como validar automaticamente)

## Setup em projeto novo (5 min)

### 1. Copiar arquivos

```bash
# Na raiz do seu projeto:
mkdir -p scripts/ralph
cp ~/Desktop/_templates_personas/ralph-loop/ralph.sh scripts/ralph/
cp ~/Desktop/_templates_personas/ralph-loop/prd-template.json prd.json
cp ~/Desktop/_templates_personas/ralph-loop/progress-template.txt progress.txt
```

### 2. Editar prd.json

Substitua as stories de exemplo pelas suas. Regras:
- Cada story cabe em 1 context window (1 sessao do Claude)
- Acceptance criteria testavel (build passa, arquivo existe, etc.)
- Ordem importa: story 1 antes da 2, etc.

### 3. Adicionar protocolo ao CLAUDE.md

Copie o conteudo de `claude-md-section.md` pro CLAUDE.md do seu projeto.
Adapte o build command e os arquivos protegidos.

### 4. Git init (se ainda nao tem)

```bash
git init && git add -A && git commit -m "chore: initial setup"
```

### 5. Rodar

```bash
bash scripts/ralph/ralph.sh 10
```

## Opcoes

```bash
# Rodar 5 iteracoes max
bash scripts/ralph/ralph.sh 5

# Sem commit automatico (MauMau revisa)
bash scripts/ralph/ralph.sh 10 --no-commit

# Dry run (mostra o que faria sem executar)
bash scripts/ralph/ralph.sh 10 --dry-run
```

## Acompanhar progresso

```bash
# Ver checklist de stories
node -e "JSON.parse(require('fs').readFileSync('prd.json','utf8')).stories.forEach(s=>console.log(s.passes?'[x]':'[ ]',s.id+':',s.title))"

# Ver aprendizados
cat progress.txt

# Ver commits do Ralph
git log --oneline
```

## Estrutura

```
_templates_personas/ralph-loop/
  ralph.sh              # Script do loop (generico, qualquer projeto)
  prd-template.json     # Template de stories (copiar e preencher)
  progress-template.txt # Template do log de progresso
  claude-md-section.md  # Trecho pra colar no CLAUDE.md do projeto
  README.md             # Este arquivo
```

## Stacks suportadas

O script auto-detecta o build command:
- **Node.js**: `npm run lint && npm run build` (lint se existir no package.json, senao so build)
- **Rust**: `cargo build`
- **Python**: `pytest` (se configurado) → `make lint` (se Makefile) → `flake8 critical errors` (fallback)
- **Go**: `go build ./...`

## Seguranca

- Se voce estiver na `main`/`master` com commit habilitado, o script **avisa e pede confirmacao**
- Recomendado: criar branch isolada antes de rodar (`git checkout -b ralph/feature-name`)
- Usar `--no-commit` se quiser revisar manualmente cada iteracao

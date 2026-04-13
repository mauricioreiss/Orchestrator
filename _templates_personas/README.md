# Templates de Personas para Claude Multi-Terminal

## Como Usar
1. Copie os 4 arquivos .md para a raiz do seu projeto
2. Edite as seções [PROJETO] com o contexto do seu projeto
3. Abra 4 terminais Claude, um para cada persona
4. Cole o conteúdo do arquivo correspondente como primeira mensagem

## Arquivos
- `persona-principal.md` — Lider tecnico, coordenador, revisor
- `persona-arquiteto.md` — Backend, escalabilidade, performance
- `persona-inovacao.md` — Frontend, UI/UX, experiencia do usuario
- `persona-cybersec.md` — Seguranca, auditoria, pentesting

## Workflow
1. Principal gera tasks e distribui para os outros 3
2. Cada persona trabalha na sua area
3. Personas reportam output ao usuario
4. Usuario cola output no terminal do Principal
5. Principal revisa, aprova ou rejeita
6. Ciclo repete

## Dicas
- Sempre incluir branch de trabalho e arquivos protegidos nos prompts
- Sempre pedir commits separados por task
- Sempre pedir testes apos cada mudanca
- Principal deve verificar claims do CyberSec (falsos positivos sao comuns)

## Principios de Design das Personas (v2)
- **Sintese obrigatoria**: Principal sintetiza contexto — nunca escreve "baseado no que discutimos"
- **Template padrao**: Todo prompt segue formato Objetivo/Contexto/Instrucoes/Constraints/Verificacao
- **Tool scoping**: Cada persona so mexe no seu dominio (backend/frontend/security report)
- **Failure modes**: Cada persona documenta seus vieses e como combate-los
- **Evidencia > narrativa**: Reviews e audits exigem output real de comandos, nao "eu li o codigo"
- **Memoria estruturada**: MEMORY.md e indice, detalhes em topic files, drift check antes de recomendar

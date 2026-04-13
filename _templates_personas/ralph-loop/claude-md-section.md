# Ralph Loop Protocol — COLE ISSO NO CLAUDE.md DO SEU PROJETO

Copie a seção abaixo para o CLAUDE.md do projeto onde quer usar Ralph Loop.
Adapte o que estiver entre [COLCHETES].

---

## Ralph Loop Protocol

You are running inside a Ralph Loop. Each iteration you MUST:

1. Read `prd.json` — find the FIRST story where `"passes": false`
2. Read `progress.txt` — learn from previous iterations
3. Implement ONLY that one story
4. Run [BUILD COMMAND: npm run build / cargo build / go build / etc] — must pass with zero errors
5. If build fails: fix and retry. Do NOT move on with broken build.
6. Commit with message: `feat(story-N): <title>`
7. Update `prd.json` — set that story's `"passes": true`
8. Append to `progress.txt`: `[N] what was done | what was learned`
9. Stop. Do NOT start the next story. Exit cleanly.

If ALL stories have `"passes": true`, say "All stories complete" and exit.

## Protected Files (DO NOT modify)

- prd.json — only update "passes" field
- progress.txt — only append, never delete lines
- CLAUDE.md — do not modify
- [ADD OTHER PROTECTED FILES/DIRS HERE]

---

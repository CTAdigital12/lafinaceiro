# Estado atual

> Atualize em PR. Declare apenas o que foi verificado; não presuma o que está em outra branch.

- **Referência:** `main` em `e0acda2` (merge do PR #139, instalação do Dev Memory).
- **Última atualização:** 2026-11-09 (branch `docs/congelar-lessons`).

## Verificado
- Kit Dev Memory copiado de `gestor-de-ia@5e6688d`; arquivos idênticos byte a byte. Ver [ADR-0001](decisions/ADR-0001-adocao-dev-memory.md).
- Instalação sem impacto nos gates (2026-11-09, local): `npm run memory:test` 37/37; vitest 776/776 (76 arquivos;
  nenhum teste do kit incluído); typecheck 0 erros; lint 0 erros e 0 warnings (17 arquivos do kit analisados).
- `.gitignore`: `git check-ignore` confirma `.claude/backups`, `.claude/settings.json` e `.claude/settings.local.json`
  ignorados; só `.claude/skills/close-task/SKILL.md` versionável.
- Hook `Stop` ativo só na máquina de André (`.claude/settings.local.json`, não versionado).
- **Claude Code 2.1.319 carrega `AGENTS.md` via `CLAUDE.md`** (2026-11-09): uma sessão sem ferramentas de leitura
  apontou o `AI_CONTEXT.md` como fonte de verdade, os dois lugares de memória e o `/close-task` ao terminar.
- CI do PR de instalação (#139): `ci.yml` (testes, typecheck, lint), `dev-memory.yml` e Vercel, todos verdes.
  Depois do merge, o CI do `main` também passou.
- `.claude-squad/lessons.md` congelado como registro da migração ([ADR-0002](decisions/ADR-0002-lessons-md-e-dev-memory.md),
  aprovado). Lições novas vão para `.ai/memory/`.

- L1, L2 e L4 do `lessons.md` reproduzidas em 2026-11-09 (PostgreSQL 16.14 local, `/bin/bash` 3.2.57). Confirmadas no
  essencial, com correções registradas como errata no topo do `lessons.md`.

## Em andamento
- Promoção de L1, L2 e L4 ao `organization-knowledge` como ORG-0004, ORG-0003 e ORG-0002 (PR #3 de lá, `verified`).

## Pendente
- Primeira tarefa real com `close-task`: uma correção de aplicação deve gerar um registro concreto (SOL),
  ou `no-memory-change` justificado.
- Codex e Gemini CLI: não verificados (não instalados na máquina de desenvolvimento).

## Decisões abertas
- Nenhuma.

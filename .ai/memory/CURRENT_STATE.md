# Estado atual

> Atualize em PR. Declare apenas o que foi verificado; não presuma o que está em outra branch.

- **Referência:** `main` em `70ff57b` (merge do PR #140). Kit Dev Memory sincronizado com `gestor-de-ia@29f809b`
  na branch `chore/sincronizar-close-task`.
- **Última atualização:** 2026-11-11 (branch `fix/paginacao-budget-exportacao`, sobre `main` em `c1f055e`).

## Verificado
- Kit Dev Memory instalado (PR #139). Ver [ADR-0001](decisions/ADR-0001-adocao-dev-memory.md). Os arquivos do kit são
  idênticos aos de `gestor-de-ia@29f809b`; a última sincronização trouxe a correção do `close-task` (o caminho sem
  memória também roda `check-staleness` e sugere trailers).
- Instalação sem impacto nos gates (2026-11-09, local): `npm run memory:test` 37/37; vitest 776/776 (76 arquivos;
  nenhum teste do kit incluído); typecheck 0 erros; lint 0 erros e 0 warnings (17 arquivos do kit analisados).
- `.gitignore`: `git check-ignore` confirma `.claude/backups`, `.claude/settings.json` e `.claude/settings.local.json`
  ignorados; só `.claude/skills/close-task/SKILL.md` versionável.
- Hook `Stop` ativo só na máquina de André (`.claude/settings.local.json`, não versionado).
- **Claude Code 2.1.319 carrega `AGENTS.md` via `CLAUDE.md`** neste repositório (2026-11-09): uma sessão sem ferramentas
  de leitura apontou o `AI_CONTEXT.md` como fonte de verdade, os dois lugares de memória e o `/close-task` ao terminar.
- CI dos PRs #139 e #140 e do `main` depois deles: `ci.yml`, `dev-memory.yml` e Vercel verdes.
- `.claude-squad/lessons.md` congelado como registro da migração, com errata de L1, L2 e L4
  ([ADR-0002](decisions/ADR-0002-lessons-md-e-dev-memory.md), aprovado).
- L1, L2 e L4 reproduzidas (PostgreSQL 16.14, `/bin/bash` 3.2.57) e publicadas no `organization-knowledge` como
  ORG-0004, ORG-0003 e ORG-0002 (aprovadas, 2026-11-09).

- Primeira tarefa real com `close-task` (PR #142, merge `c1f055e`): a paginação do "Balanço Mensal" e das Atividades
  gerou a [SOL-0001](solutions/SOL-0001-postgrest-trunca-em-1000-sem-erro.md) (`proposed`).
- Na branch `fix/paginacao-budget-exportacao` (2026-11-11): gráfico de evolução do Planejamento e exportação de conta
  paginados; a linha "Gasto" do gráfico passa a usar a mesma soma do card "Total Gasto"
  ([SOL-0002](solutions/SOL-0002-soma-de-despesa-com-filtro-inline-diverge.md)); `useCreditCardTransactions`
  (sem chamador) removido. Com isso, nenhuma leitura de `transactions` conhecida que some ou exporte o conjunto
  inteiro fica sem paginação. O levantamento foi por `grep`, não exaustivo.

## Pendente
- **Codex CLI:** verificado no kit (`gestor-de-ia`, em cópias descartáveis), **não neste repositório** (opção de não
  enviar conteúdo deste projeto, com dados financeiros, para outro provedor durante testes).
- **Gemini CLI:** não testado; este repositório não tem `GEMINI.md`.

## Decisões abertas
- Nenhuma.

# Índice de memória técnica

> **Gerado por `node scripts/dev-memory/cli.mjs build-index`. Não edite à mão.**
> Registros `rejected` não são indexados. Registros são evidência histórica:
> confira código, versões e testes antes de aplicar.

Contexto do projeto: [PROJECT.md](PROJECT.md) · Estado atual: [CURRENT_STATE.md](CURRENT_STATE.md)

## Decisões (ADR)

| ID | Título | Status | Arquivos | Revisada |
|---|---|---|---|---|
| [ADR-0001](decisions/ADR-0001-adocao-dev-memory.md) | Adoção do Dev Memory com .claude/skills versionado e hook de lembrete só local | approved | .gitignore | 2026-11-09 |
| [ADR-0002](decisions/ADR-0002-lessons-md-e-dev-memory.md) | Conhecimento novo vai para .ai/memory via close-task; lessons.md congelado como registro da migração | approved | .claude-squad/lessons.md | 2026-11-09 |

## Soluções (SOL)

| ID | Título | Status | Confiança | Stack | Tags | Arquivos | Revisada |
|---|---|---|---|---|---|---|---|
| [SOL-0001](solutions/SOL-0001-postgrest-trunca-em-1000-sem-erro.md) | Leitura de transactions truncada em 1000 linhas pelo PostgREST, sem erro — paginar com fetchAllRows e ordem estável | proposed | high | typescript, supabase, postgrest, react-query | paginacao, postgrest, max-rows, truncamento-silencioso, transactions | src/lib/fetchAllRows.ts, src/lib/balanceChartData.ts, src/hooks/useActivities.ts, src/hooks/useCreditCardInvoiceSync.ts, src/lib/accountBalance.ts, src/lib/budgetEvolutionData.ts, src/pages/Accounts.tsx | — |
| [SOL-0002](solutions/SOL-0002-soma-de-despesa-com-filtro-inline-diverge.md) | Soma de despesa com filtro inline diverge das outras telas — usar os helpers de transactionFilters | proposed | high | typescript, react | planejamento, despesa, estorno, competencia, transactionFilters, consistencia-entre-telas | src/lib/transactionFilters.ts, src/lib/budgetEvolutionData.ts, src/pages/Planning.tsx, src/components/dashboard/BudgetEvolutionChart.tsx | — |

## Problemas conhecidos (ISSUE)

_Nenhum problema conhecido registrado._

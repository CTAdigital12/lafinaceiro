---
id: SOL-0002
type: solution
title: Soma de despesa com filtro inline diverge das outras telas — usar os helpers de transactionFilters
status: proposed
created_at: 2026-11-11
reviewed_at: null
scope: project
stack: [typescript, react]
tags: [planejamento, despesa, estorno, competencia, transactionFilters, consistencia-entre-telas]
files:
  - src/lib/transactionFilters.ts
  - src/lib/budgetEvolutionData.ts
  - src/pages/Planning.tsx
  - src/components/dashboard/BudgetEvolutionChart.tsx
deps: []
related_prs: [55]
related_commits: []
supersedes: []
review_required: false
confidence: high
---

## Sintoma reproduzível
Duas telas, ou duas partes da mesma tela, mostram "gasto do mês" diferentes para o mesmo mês, sem erro.
Casos no projeto:
- M17 (auditoria): a regra de despesa estava escrita em três lugares (`reportUtils` e dois callbacks do Dashboard),
  e as cópias discordavam.
- PR #55: o "Total Gasto" do Planejamento não abatia estornos e divergia da tela de Transações.
- 2026-11-11: a linha "Gasto" do gráfico de evolução do Planejamento (`BudgetEvolutionChart`) divergia do card
  "Total Gasto" da mesma tela.

## Erro exato
Sem mensagem de erro. Só números diferentes entre telas.

## Causa raiz confirmada
Filtro de despesa reescrito à mão na tela, em vez de usar `src/lib/transactionFilters.ts`. No gráfico de evolução,
a consulta filtrava `type='expense'` e `is_corporate_expense=false` e agrupava pela data da compra. Com isso:
- contava pagamento de fatura (`is_card_payment`), que é transferência interna, além das compras que ele paga;
- não abatia estorno, e o estorno de cartão gravado como receita (`type='income'` + `is_refund`) nem chegava;
- contava reembolsável e não separava prevista de paga;
- colocava a compra de cartão no mês da compra, não no do vencimento (competência).

Confirmada por teste: com a soma antiga, um mês de cenário dá 1480, e o card daria 580.

## Diagnóstico executado
Comparação do filtro do gráfico com o do card (`Planning.tsx`, pagas − estornos + previstas, via `useTransactions`
com `useHybridDateFilter`). `grep` no `AI_CONTEXT.md` não acha `transactionFilters`: a regra só estava nos comentários
do próprio módulo.

## Correção aplicada
- `sumBudgetSpending` em `transactionFilters.ts`: a soma do Planejamento (pagas = `isMonthlyExpense` −
  `isMonthlyExpenseRefund`; previstas = `isForecastExpense`). O card e o gráfico chamam a mesma função.
- `fetchBudgetSpentByMonth` (`src/lib/budgetEvolutionData.ts`): ano inteiro por competência
  (`competenceRangeFilter` + `getCompetenceDate`), paginado (ver [SOL-0001](SOL-0001-postgrest-trunca-em-1000-sem-erro.md)),
  sem filtrar `type` nem `user_id` no banco. O card também não filtra `user_id`: quem recorta é o RLS.

## Validação
Executado em 2026-11-11 na branch `fix/paginacao-budget-exportacao`:
- `src/lib/__tests__/budgetEvolutionData.test.ts`: o teste de regra falha com a soma antiga (1480 contra 580),
  e o de paginação falha sem `fetchAllRows`. Os dois passam com a correção.
- `src/lib/__tests__/transactionFilters.test.ts`: `sumBudgetSpending` com estorno de cartão como receita, prevista,
  pagamento de fatura, empresa e reembolsável.
- `npm test` 783/783; `npm run typecheck` 0 erros; `npm run lint` 0 erros e 0 warnings.
- Não visto na tela. Depois do deploy, a linha "Gasto" do mês aberto deve bater com o card "Total Gasto".

## Quando reutilizar
- Toda tela nova que soma ou filtra despesa ou receita do mês: chame os helpers de `transactionFilters.ts`.
  Nunca reescreva `type === 'expense' && !is_corporate_expense ...` na página.
- Totais que divergem entre telas: procure primeiro um filtro inline, depois estorno (abate?), pagamento de fatura
  (exclui?), prevista/pendente e competência (cartão pelo vencimento).
- A consulta no banco não deve filtrar `type='expense'` quando a soma precisa abater estorno de cartão, que vem como receita.

## Quando NÃO reutilizar
- Recortes que são de propósito diferentes da despesa do mês, como a fatura (`invoiceTotal.ts`, que soma pagamento
  e estorno com sinais próprios) e o saldo de conta (`accountBalance.ts`). Esses têm regra própria documentada.

## Evidências
- PR #55: "Total Gasto" = pagas + previstas, com estorno abatendo.
- Auditoria M17: consolidação das cópias em `transactionFilters.ts`.
- Branch `fix/paginacao-budget-exportacao` (2026-11-11): gráfico de evolução alinhado ao card.

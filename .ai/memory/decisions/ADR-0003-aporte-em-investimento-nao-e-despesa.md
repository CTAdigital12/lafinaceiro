---
id: ADR-0003
type: decision
title: Aporte em investimento é despesa com a flag is_investment_contribution, fora da despesa e do orçamento
status: proposed
created_at: 2026-11-20
reviewed_at: 2026-11-21
owner: André Domingues
scope: project
files:
  - src/lib/transactionFilters.ts
  - supabase/migrations/20261120120000_aporte_em_investimento.sql
  - src/components/modals/AccountReviewModal.tsx
  - src/hooks/useCategorizationRules.ts
  - src/hooks/useInvestments.ts
  - src/lib/ruleMatch.ts
  - src/lib/investments/assetTypes.ts
  - src/lib/investments/linkedTransaction.ts
  - src/components/investments/LinkToAccountSection.tsx
deps: []
related_prs: [146, 147]
supersedes: []
review_required: false
---

## Contexto
O débito mensal do título de capitalização sai da conta corrente e era gravado como despesa comum
(categoria Investimentos), inflando a despesa do mês e consumindo orçamento no Planejamento. Toda
aplicação feita pela tela de Investimentos tinha o mesmo efeito: `createOrLinkTransactionForOp` cria
uma despesa "Investimento: TICKER". A regra única do que é despesa (`transactionFilters.ts`) só
excluía o pagamento de fatura (`is_card_payment`).

Restrições:
- O saldo da conta (`accountBalance.ts`) soma por `type` e não olha flags: a saída precisa continuar
  debitando.
- Não existe gerador a partir de `recurring_rules` (removido em f20c8bd). O débito mensal entra pela
  importação do extrato, e a única automação nesse caminho é `categorization_rules`.

## Decisão
- A coluna nova `transactions.is_investment_contribution` (boolean, default false). A linha continua
  `type='expense'`.
- `isSettledExpense` e `isForecastExpense` recusam a flag. `isInvestmentContribution` e
  `sumInvestmentContributions` alimentam o card "Aportes" do Dashboard e do Planejamento e a linha de
  aportes em Transações.
- `categorization_rules.is_investment_contribution` marca o lançamento na importação do extrato, em
  "aplicar regras" e no "lembrar regra". A regra só LIGA a flag, e só em despesa.
- Todo BUY criado em Investimentos nasce marcado.
- O aporte exclui corporativa, reembolsável e pagamento de fatura, tanto na tela quanto no payload.
- `split_transaction` propaga a flag para as partes.
- As regras de categorização passam a casar ignorando espaços repetidos (`ruleMatch.ts`): o extrato
  do Itaú trocou `CAP     PIC        40 60` por `CAP PIC 41 60` em 09/2026, e uma regra que falha em
  silêncio devolve o aporte à despesa.
- Tipo de ativo `capitalizacao` (precificado por saldo), com a CHECK recriada na mesma migração.
- Escopo, escolhido pelo responsável em 2026-11-20: toda aplicação, não só a capitalização, com os
  aportes visíveis à parte (não como transferência invisível).

## Alternativas consideradas
- **Transferência invisível**, como o pagamento de fatura, sem total de aportes: recusada pelo
  responsável, que quer enxergar quanto guardou no mês.
- **Novo `type` (ex.: `transfer`):** quebraria o saldo, que trata como débito tudo que não é `income`,
  e todo `type === 'expense'` espalhado pelo código.
- **Flag na categoria (Investimentos):** mais simples de marcar, mas misturaria classificação com
  regra de cálculo. Também afetaria lançamentos que o usuário quer como despesa naquela categoria,
  e as categorias são compartilhadas entre membros.
- **Flag em `recurring_rules`:** inócua, porque nenhum código gera transação a partir dela.

## Consequências
- A despesa do mês e o "Total Gasto" caem pelo valor dos aportes; o saldo da conta não muda.
- Uma meta de orçamento na categoria Investimentos deixa de ser consumida. Ela deve ser removida ou
  comparada com o card Aportes.
- Os débitos históricos continuam despesa até serem marcados (não há retroativo na migração).
- Cada leitura com lista explícita de colunas que passa linhas para `transactionFilters` precisa
  incluir `is_investment_contribution`, ou a regra não enxerga a flag. Feito em `balanceChartData`,
  `budgetEvolutionData` e `useProjects`.
- A aplicação (BUY) pode VINCULAR um débito existente (`linkMode="existing"`), que é marcado como
  aporte, em vez de criar outra saída. Editar ou excluir a operação só apaga o lançamento que o app
  criou (`isAutoCreatedLinkedTransaction`, prefixos "Investimento:"/"Resgate:"); o débito vinculado do
  usuário fica, e continua aporte. Antes, todo BUY apagava o vínculo sem olhar.

## Evidências
- `src/lib/__tests__/transactionFilters.test.ts`, bloco "aporte em investimento": 60/60. Com a
  exclusão revertida em `transactionFilters.ts`, 3 testes falham.
- `src/components/modals/__tests__/AccountReviewModal.aporte.test.tsx`: 2/2. Sem a flag no payload,
  2 falham.
- `supabase/tests/aporte_na_divisao.sql`, rodado em Postgres local descartável (2026-11-20): quatro
  casos "ok" (inclusive a CHECK aceitando `capitalizacao` e recusando tipo desconhecido).
- `src/lib/__tests__/ruleMatch.test.ts`: os dois formatos do extrato casam com "CAP PIC"; "PICPAY" não.
- Local, 2026-11-20: `npm test` 795/795 (81 arquivos), `npm run typecheck` e `npm run lint` sem erros.
- PR #146 mesclado (`fac231a`). Migração **aplicada** e conferida em 2026-11-20 por sonda de leitura no
  SQL Editor: colunas, CHECK, `split_transaction` e os 11 débitos do título marcados (7/7 itens).
- Vínculo da aplicação (2026-11-21): `src/hooks/__tests__/useInvestments.vinculoAplicacao.test.tsx` 5/5
  sobre banco falso em memória. Com a exclusão antiga (todo BUY apaga o vínculo), 2 falham: excluir e
  editar a aplicação apagavam o débito do extrato. `npm test` 815/815.

## Revisão / obsolescência
- Revisar se surgir um gerador de recorrência (a flag precisaria ir para `recurring_rules`).
- Revisar se o saldo passar a filtrar por flag.
- Revisar se aparecer outro tipo de saída "não despesa" (ex.: transferência entre contas próprias):
  avaliar generalizar a flag em vez de criar uma terceira.

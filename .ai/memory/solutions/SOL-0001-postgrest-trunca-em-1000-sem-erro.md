---
id: SOL-0001
type: solution
title: Leitura de transactions truncada em 1000 linhas pelo PostgREST, sem erro — paginar com fetchAllRows e ordem estável
status: proposed
created_at: 2026-11-10
reviewed_at: null
scope: project
stack: [typescript, supabase, postgrest, react-query]
tags: [paginacao, postgrest, max-rows, truncamento-silencioso, transactions]
files:
  - src/lib/fetchAllRows.ts
  - src/lib/balanceChartData.ts
  - src/hooks/useActivities.ts
  - src/hooks/useCreditCardInvoiceSync.ts
  - src/lib/accountBalance.ts
deps:
  - name: "@supabase/supabase-js"
    version: "^2"
related_prs: [124, 131]
related_commits: [b22a6ce, 6db3296]
supersedes: []
review_required: false
confidence: high
---

## Sintoma reproduzível
Uma consulta a `transactions` sem `.range()` que deveria trazer mais de 1000 linhas volta com exatamente 1000,
e a tela mostra um número plausível, mas errado. Casos no projeto:
- PR #131: o "Saldo em aberto" do cartão (`recalculateInvoice`) somava o histórico inteiro; com mais de 1000
  lançamentos no cartão, os pagamentos ficaram fora do corte e o saldo foi **gravado** várias vezes maior que o real.
- PR #124: a revisão do extrato deixava de ver lançamentos já existentes e oferecia importá-los de novo.
- Auditoria C2 (`accountBalance.ts`): a soma do saldo saiu truncada e foi gravada como `initial_balance`.
- Latentes, fechados na branch `fix/paginacao-balancechart-activities`: o gráfico "Balanço Mensal"
  (6 meses de tudo, cerca de 600 linhas em set/2026) e a tela de Atividades (todas as linhas importadas). Quando
  passassem do teto, os meses ou importações mais antigos perderiam linhas, e o "Desfazer" de uma importação
  apagaria mais do que a tela mostrava.

## Erro exato
Sem mensagem de erro. O PostgREST responde 200 com a lista cortada no `max-rows` do projeto (padrão do Supabase: 1000).

## Causa raiz confirmada
O `max-rows` do PostgREST limita toda resposta, e o supabase-js não avisa nem pagina sozinho. Confirmada em
produção no PR #131: com a leitura paginada e o `recompute_card_invoice` rodado, o saldo voltou ao valor do banco.

## Diagnóstico executado
- PR #131: contagem de linhas do cartão acima de 1000 e soma da leitura truncada × soma paginada.
- Nesta branch, com teste que imita o PostgREST (sem `.range()`, devolve as 1000 primeiras; com `.range()`,
  a fatia pedida, também limitada a 1000): sem a paginação, o junho do gráfico sai zerado e a importação de outubro
  aparece com 300 de 400 linhas. Com a paginação, os números ficam certos.

## Correção aplicada
Toda leitura que **soma, agrupa ou compara** o conjunto inteiro passa por `fetchAllRows` (`src/lib/fetchAllRows.ts`):
```ts
const rows = await fetchAllRows((from, to) =>
  supabase.from("transactions").select("…")./* filtros */order("id").range(from, to),
);
```
- A ordem **precisa** ser estável: `.order("id")`, ou `id` como desempate depois de outra ordem
  (`useActivities`: `imported_at desc`, depois `id`). Sem isso, linhas se repetem ou somem entre páginas.
- `fetchAllRows` avança pelo que realmente veio, não pelo tamanho pedido, e lança erro em vez de devolver parcial.
- Quando a lógica vive num componente (`BalanceChart`), ela vai para `src/lib` para poder ser testada sem a UI
  (`fetchBalanceChartData`).

## Validação
Executado em 2026-11-10 na branch `fix/paginacao-balancechart-activities`:
- `src/lib/__tests__/balanceChartData.paginacao.test.ts` e `src/hooks/__tests__/useActivities.test.tsx`:
  passam com a correção e **falham** com ela revertida (só a paginação desfeita, para provar que o teste pega o defeito).
- `npm test`: 78 arquivos, 779/779; `npm run typecheck`: 0 erros; `npm run lint`: 0 erros.
- Ainda não visto na tela (o volume atual dessas duas telas ainda está abaixo de 1000).

## Quando reutilizar
- Qualquer `select` em `transactions` (ou outra tabela que cresce) sem filtro estreito, cujo resultado é somado,
  agrupado, comparado com outra fonte ou usado para decidir o que gravar ou apagar.
- Ao revisar um número "plausível, mas errado" em tela de agregação: conte as linhas que a consulta deveria trazer.
- Para testar: copie o mock de PostgREST com teto de `src/hooks/__tests__/useCreditCardInvoiceSync.paginacao.test.tsx`.

## Quando NÃO reutilizar
- Consultas estreitas por construção (um lançamento, um grupo de parcelas ou de rateio, `.single()`, `head: true`).
- Listas paginadas para a pessoa (`useTransactions` usa `.range()` com `count: "exact"` para a paginação da tela):
  ali o recorte é intencional, e trazer tudo seria regressão de desempenho.
- `fetchAllRows` não substitui agregação no banco: se o volume crescer muito, uma RPC/view que já devolve a soma
  é melhor do que trazer todas as linhas.

## Evidências
- PR #124 (merge `b22a6ce`): revisão do extrato e "Sincronizar" paginados.
- PR #131 (merge `6db3296`): `recalculateInvoice` paginado; teste de referência do mock com teto.
- Branch `fix/paginacao-balancechart-activities` (2026-11-10): `BalanceChart` e `useActivities`.

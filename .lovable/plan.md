
# Excluir receitas corporativas dos totais

## Problema
Despesas marcadas como `is_corporate_expense` ja sao excluidas do total de despesas. Porem, quando o reembolso corporativo chega (ex: PIX de R$ 244,47), ele e registrado como receita e **infla o total de receitas**, o que nao faz sentido -- se a despesa nao conta, a receita correspondente tambem nao deve contar.

## Solucao
Filtrar receitas com `is_corporate_expense: true` dos totais de receita, em todos os lugares onde o calculo e feito. Nenhuma alteracao de banco de dados e necessaria -- o campo `is_corporate_expense` ja existe na tabela `transactions` e pode ser usado em transacoes do tipo `income`.

## Alteracoes

### 1. `src/hooks/useTransactions.ts`
- No calculo de `totalIncome` (linha 327-329), adicionar `&& !t.is_corporate_expense` ao filtro:

```text
Antes:  .filter((t) => t.type === "income" && !t.is_refund)
Depois: .filter((t) => t.type === "income" && !t.is_refund && !t.is_corporate_expense)
```

### 2. `src/components/dashboard/BalanceChart.tsx`
- No calculo de `receitas` (linha 61-63), excluir transacoes corporativas:

```text
Antes:  .filter((t) => t.type === "income")
Depois: .filter((t) => t.type === "income" && !t.is_corporate_expense)
```

### 3. `src/pages/Transactions.tsx`
- No calculo de `tabTotalIncome`, adicionar o mesmo filtro `!t.is_corporate_expense`

## Como usar
Ao registrar o PIX de reembolso corporativo de R$ 244,47:
1. Crie uma transacao do tipo **Receita**
2. Marque como **Despesa de empresa** (is_corporate_expense)
3. O valor nao sera somado nas receitas pessoais, mantendo os totais corretos

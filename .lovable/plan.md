
# Plano: Corrigir Reconciliação - Incluir Pagamentos na Query

## Problema Identificado

A transação de pagamento de R$ 28.586,73 existe no banco de dados:

| Campo | Valor |
|-------|-------|
| `description` | "Baixa Corporativa - Itaú Personnalité Black" |
| `amount` | R$ 28.586,73 |
| `type` | **`income`** (entrada na conta do cartão) |
| `is_card_payment` | `true` |
| `date` | 2026-01-15 |
| `due_date` | NULL |

**Causa raiz**: A query do hook `useCreditCardReconciliation` filtra apenas:
```typescript
.eq("type", "expense")
```

Isso exclui as transações de pagamento que têm `type = 'income'`.

## Solução

Modificar a query para incluir transações de pagamento, permitindo calcular corretamente o `paidAmount`.

## Mudanças Técnicas

### Arquivo: `src/hooks/useCreditCardReconciliation.ts`

**Linhas 72-77 - Ajustar query para incluir pagamentos:**

Antes:
```typescript
const { data, error } = await supabase
  .from("transactions")
  .select("*, categories(name, icon)")
  .not("credit_card_id", "is", null)
  .eq("type", "expense")
  .or(`and(due_date.gte.${periodStart},...)`);
```

Depois:
```typescript
const { data, error } = await supabase
  .from("transactions")
  .select("*, categories(name, icon)")
  .not("credit_card_id", "is", null)
  // Include expenses OR payment transactions (is_card_payment = true)
  .or(`type.eq.expense,is_card_payment.eq.true`)
  .or(`and(due_date.gte.${periodStart},due_date.lte.${periodEnd}),and(due_date.is.null,date.gte.${periodStart},date.lte.${periodEnd})`);
```

**Linhas 102-127 - Ajustar cálculos para excluir pagamentos do total de transações:**

O `transactionsTotal` deve excluir as transações de pagamento (elas não são "gastos"):

```typescript
// Filter OUT payment transactions from expense calculations
const expenseTransactions = cardTransactions.filter(
  (t) => t.is_card_payment !== true
);

// Use expenseTransactions for calculating totals
const completedTransactions = expenseTransactions.filter(
  (t) => t.status === "completed"
);
// ... resto dos cálculos
```

**Linhas 144-154 - Pagamentos agora serão incluídos:**

A lógica existente já busca `paymentTransactions` corretamente, mas agora elas estarão disponíveis porque a query as incluiu.

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| Query: `type = expense` | Query: `type = expense OR is_card_payment = true` |
| `paidAmount = 0` | `paidAmount = 28.586,73` |
| `difference = 40.733 - 0 = 40.733` | `difference = 40.733 - 28.586 = 12.147` |
| Exibe "Diferença: R$ 40.733" | Exibe diferença real ou "Paga" se `isPaid` |

## Arquivos a Modificar

1. **`src/hooks/useCreditCardReconciliation.ts`**
   - Linhas 72-77: Ajustar query para incluir `is_card_payment = true`
   - Linhas 102-127: Filtrar pagamentos do cálculo de `transactionsTotal`

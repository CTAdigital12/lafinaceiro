
# Correção: Discrepância no Cálculo de Despesas do Cartão

## Problema Identificado

A soma de despesas exibida na aba "Cartão de Crédito" da página de Transações (R$ 40.834,57) não bate com o total de lançamentos da reconciliação (R$ 40.733,78).

**Causa:** O cálculo de `tabTotalExpense` na página de Transações simplesmente **ignora** os estornos ao invés de **subtraí-los** do total.

**Prova matemática:**
- Total Transações: R$ 40.834,57
- Total Reconciliação: R$ 40.733,78
- Diferença: **R$ 100,79** (exatamente o valor dos estornos!)

---

## Análise Técnica

### Cálculo ATUAL (Incorreto) - `src/pages/Transactions.tsx` linha 435-440

```typescript
const tabTotalExpense = filteredTransactions
  .filter((t) => 
    (t.type === "expense" && !t.is_refund && !t.is_card_payment) ||
    (t.type === "income" && t.is_refund)  // ← Não subtrai estornos de expense
  )
  .reduce((sum, t) => sum + Number(t.amount), 0);
```

Este filtro:
- Soma despesas normais (`expense && !is_refund`) 
- Soma estornos de receita (`income && is_refund`)
- **Problema:** Não subtrai estornos de despesa!

### Cálculo CORRETO (Reconciliação) - `useCreditCardReconciliation.ts`

```typescript
const normalTotal = normalTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
const refundTotal = refundTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
const transactionsTotal = normalTotal - refundTotal;  // ← Subtrai estornos
```

---

## Solução

Modificar o cálculo de `tabTotalExpense` para subtrair os estornos corretamente:

### Arquivo: `src/pages/Transactions.tsx`

**Modificar linhas 435-440:**

```typescript
// Calcular despesas normais
const normalExpenses = filteredTransactions
  .filter((t) => 
    t.type === "expense" && !t.is_refund && !t.is_card_payment
  )
  .reduce((sum, t) => sum + Number(t.amount), 0);

// Calcular estornos (devem ser subtraídos)
const expenseRefunds = filteredTransactions
  .filter((t) => 
    t.type === "expense" && t.is_refund
  )
  .reduce((sum, t) => sum + Number(t.amount), 0);

// Total = Despesas - Estornos
const tabTotalExpense = normalExpenses - expenseRefunds;
```

---

## Resultado Esperado

Após a correção:
- **Página de Transações (aba Cartão):** R$ 40.733,78
- **Página de Cartões (Total Lançamentos):** R$ 40.733,78 (mesma formula)

Os valores serão idênticos porque ambos aplicarão a mesma lógica:
`Total = Despesas Brutas - Estornos`

---

## Resumo da Mudança

| Local | Antes | Depois |
|-------|-------|--------|
| Transações.tsx linha 435-440 | Ignora estornos | Subtrai estornos |
| Valor exibido | R$ 40.834,57 | R$ 40.733,78 |

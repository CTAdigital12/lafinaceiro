

# Correção: Despesas (Cartão) mostrando R$ 52.699,56

## Problema Identificado

O card "Despesas (Cartão)" está exibindo **R$ 52.699,56** quando deveria mostrar **R$ 40.552,51**.

### Causa Raiz

O cálculo de `tabTotalExpense` em `src/pages/Transactions.tsx` (linhas 435-440) não exclui os pagamentos de fatura:

```typescript
// Código atual (ERRADO)
const tabTotalExpense = filteredTransactions
  .filter((t) => 
    (t.type === "expense" && !t.is_refund) ||
    (t.type === "income" && t.is_refund)
  )
  .reduce((sum, t) => sum + Number(t.amount), 0);
```

Este filtro inclui transações com `is_card_payment = true`, que são pagamentos de fatura e não despesas reais.

### Valores Calculados

| Componente | Valor |
|------------|-------|
| Despesas Corretas | R$ 40.552,51 |
| Pagamentos de Fatura | R$ 12.147,05 |
| **Soma Errada** | **R$ 52.699,56** |

---

## Solução

### Arquivo: `src/pages/Transactions.tsx`

Modificar o cálculo de `tabTotalExpense` (linhas 435-440) para excluir pagamentos de fatura:

```typescript
// Código corrigido
const tabTotalExpense = filteredTransactions
  .filter((t) => 
    ((t.type === "expense" && !t.is_refund && !t.is_card_payment) ||
    (t.type === "income" && t.is_refund))
  )
  .reduce((sum, t) => sum + Number(t.amount), 0);
```

A única mudança é adicionar `&& !t.is_card_payment` na condição de despesas.

---

## Resultado Esperado

Após a correção:
- **Despesas (Cartão)** mostrará R$ 40.552,51 (ou o valor líquido após estornos)
- Os pagamentos de fatura (R$ 12.147,05) não serão mais contados como despesas


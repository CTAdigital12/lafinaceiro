
# Plano: Corrigir Lógica do Saldo da Fatura

## Problema Identificado

O campo `current_invoice` está sendo calculado incorretamente:

| Campo | Valor Atual | Valor Esperado |
|-------|-------------|----------------|
| `current_invoice` | R$ 40.451,72 | R$ 0,00 (fatura paga) |

### Causa Raiz

O hook `useCreditCardInvoiceSync` calcula o saldo somando **todas as despesas de todos os tempos** e subtraindo apenas reembolsos, mas **não desconta os pagamentos** (`is_card_payment = true`).

```
Cálculo atual:
  Despesas: R$ 40.552,51
- Reembolsos: R$ 100,79
= R$ 40.451,72 (ERRADO - ignora pagamentos)

Cálculo correto:
  Despesas: R$ 40.552,51
- Reembolsos: R$ 100,79
- Pagamentos: R$ 40.733,78
= R$ -282,06 → R$ 0,00 (arredondado para não ficar negativo)
```

## Solução Proposta

### Arquivo: `src/hooks/useCreditCardInvoiceSync.ts`

Modificar a lógica de recálculo para **descontar os pagamentos** do saldo:

```typescript
// Buscar TODAS as transações do cartão (despesas + pagamentos)
const { data: transactions, error: txError } = await supabase
  .from("transactions")
  .select("amount, type, status, is_refund, is_card_payment")
  .eq("credit_card_id", creditCardId);

// Calcular o saldo:
// + Despesas completadas (não reembolsos, não pagamentos)
// - Reembolsos
// - Pagamentos (is_card_payment = true)
let invoiceTotal = 0;

for (const tx of transactions || []) {
  if (tx.status !== "completed") continue;

  if (tx.is_card_payment) {
    // Pagamentos REDUZEM o saldo
    invoiceTotal -= Number(tx.amount);
  } else if (tx.type === "expense") {
    if (tx.is_refund) {
      invoiceTotal -= Number(tx.amount);
    } else {
      invoiceTotal += Number(tx.amount);
    }
  }
}

// Garantir que não fique negativo
invoiceTotal = Math.max(0, invoiceTotal);
```

## Resultado Esperado

Após a correção:

| Campo | Antes | Depois |
|-------|-------|--------|
| `current_invoice` | R$ 40.451,72 | R$ 0,00 |
| Status visual | Mostra saldo pendente | Mostra fatura paga |

## Impacto

1. **Tela de Cartões**: O card "Fatura Banco" mostrará R$ 0,00 para cartões com fatura paga
2. **Reconciliação**: Continuará funcionando normalmente (já considera pagamentos)
3. **Limite Disponível**: Será recalculado corretamente

## Arquivos a Modificar

1. **`src/hooks/useCreditCardInvoiceSync.ts`**
   - Remover filtro `type.eq.expense` da query
   - Adicionar lógica para descontar pagamentos do saldo
   - Manter proteção contra valores negativos

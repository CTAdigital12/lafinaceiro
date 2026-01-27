
# Plano: Corrigir Exibição do Saldo Residual

## Contexto do Problema

A seção "Saldo Residual" foi implementada mas **não está aparecendo** porque a condição de exibição está incorreta.

**Situação atual:**
- `current_invoice` do cartão: **R$ 93,90**
- `transactionsTotal` (soma das transações da fatura): **R$ 40.733+** (calculado pelo hook)
- `calculatedResidual = Max(0, 93.90 - 40733) = 0`

Como a soma das transações é maior que o saldo da fatura (porque você já pagou a maior parte), a seção não aparece.

## Problema na Lógica

A lógica assume que "saldo residual" = fatura - transações. Mas após pagamentos parciais, o `current_invoice` já foi atualizado para refletir o que sobrou. As transações antigas ainda existem no período, criando essa inconsistência.

## Solução Proposta

Alterar a condição para mostrar a seção sempre que `current_invoice > 0` **E** não há valores calculados para pagar (corporativo + pessoal já foram quitados ou estão zerados).

## Mudanças no Arquivo

### `src/components/modals/PayInvoiceModal.tsx`

**Linha 130-132 - Alterar cálculo:**
```typescript
// Antes
const transactionsTotal = corporateTotal + myTotalToPay;
const calculatedResidual = Math.max(0, totalInvoice - transactionsTotal);
const hasResidualBalance = calculatedResidual > 0;

// Depois
// Se current_invoice > 0 mas não há valores de transações para pagar, 
// é saldo residual (já pagou parcialmente, sobrou diferença)
const hasTransactionsToPay = corporateTotal > 0 || myTotalToPay > 0;
const calculatedResidual = hasTransactionsToPay 
  ? Math.max(0, totalInvoice - (corporateTotal + myTotalToPay))
  : totalInvoice; // Se não há transações, todo o saldo é residual
const hasResidualBalance = totalInvoice > 0 && calculatedResidual > 0;
```

**Linha 165-167 - Ajustar inicialização:**
```typescript
// Depois
const hasTransactions = corporateTotal > 0 || myTotalToPay > 0;
const residual = hasTransactions 
  ? Math.max(0, Number(creditCard.current_invoice) - corporateTotal - myTotalToPay)
  : Number(creditCard.current_invoice);
setResidualAmount(residual.toFixed(2));
// Marcar automaticamente se todo o saldo é residual
setIncludeResidual(residual > 0 && !hasTransactions);
```

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Fatura R$ 93,90, sem transações do período | Seção não aparece | Aparece com valor R$ 93,90 |
| Fatura R$ 1000, transações = R$ 800 | Aparece R$ 200 residual | Sem mudança |
| Fatura R$ 0 | Não aparece | Não aparece |

## Arquivos a Modificar

1. **`src/components/modals/PayInvoiceModal.tsx`**
   - Linhas 130-132: Ajustar lógica de `calculatedResidual` e `hasResidualBalance`
   - Linhas 165-167: Ajustar inicialização do estado `residualAmount` e `includeResidual`

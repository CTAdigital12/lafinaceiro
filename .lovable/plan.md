

# Corrigir Data das Parcelas em Debito em Conta

## Problema

Ao criar "Seguro Apartamento" com primeiro pagamento em 02/03/2026, as parcelas estao sendo geradas a partir da data de compra (24/02/2026) em vez da data de vencimento (02/03/2026).

O bug esta na linha 220 do `TransactionModal.tsx`:

```text
const baseDate = date;  // usa data de compra (24/02)
```

As parcelas sao calculadas com `addMonths(baseDate, i - installmentNumber)`, entao saem em 24/02, 24/03, 24/04... em vez de 02/03, 02/04, 02/05...

## Solucao

Para parcelas em conta, usar a `dueDate` (data de vencimento) como base para calcular as datas das parcelas. Para parcelas em cartao, manter o comportamento atual (baseado na data de compra, pois o vencimento e calculado pelo fechamento do cartao).

## Secao Tecnica

### Arquivo: `src/components/modals/TransactionModal.tsx`

Alterar linha 220:

```typescript
// Antes:
const baseDate = date;

// Depois:
const baseDate = (paymentMethod === "account" && dueDate) ? dueDate : date;
```

Isso garante que:
- Parcelas em **conta** usam a data de vencimento informada pelo usuario (02/03 -> 02/04 -> 02/05...)
- Parcelas em **cartao** continuam usando a data de compra (o due_date do cartao e calculado automaticamente pelo fechamento)

Tambem ajustar a linha 233-234 para que, no caso de conta com dueDate, o `date` da parcela tambem use a data base correta:

```typescript
date: format(installmentDate, "yyyy-MM-dd"),
due_date: format(installmentDate, "yyyy-MM-dd"),
```

Isso ja esta correto pois `installmentDate` sera derivado de `baseDate`, que agora sera `dueDate` para contas.

Uma unica linha a alterar.


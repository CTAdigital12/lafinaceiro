
# Incluir Parcelas Futuras no Calculo do Limite Disponivel

## Problema

O limite disponivel atual e calculado como:

```text
Disponivel = Limite - Saldo Devedor (current_invoice)
           = 100.000 - 5.196,39
           = 94.803,61
```

Mas existem R$ 7.742,84 em parcelas pendentes (status "pending") que ainda serao cobradas nos proximos meses. O banco ja reserva esse valor do limite, entao o calculo correto seria:

```text
Disponivel = Limite - Saldo Devedor - Parcelas Futuras Pendentes
           = 100.000 - 5.196,39 - 7.742,84
           = 87.060,77
```

## Solucao

Adicionar uma query no hook `useCreditCards` que busca o total de parcelas pendentes por cartao e subtrai do limite disponivel.

## Secao Tecnica

### Arquivo a alterar: `src/hooks/useCreditCards.ts`

- Adicionar uma query separada que busca `SUM(amount)` das transacoes com `status = 'pending'`, `type = 'expense'`, `is_refund = false`, `is_card_payment = false`, `is_provisional = false`, agrupado por `credit_card_id`
- Expor `pendingByCard` (mapa de credit_card_id para total pendente) e `totalPendingInstallments`
- Recalcular `totalAvailable = totalLimit - totalInvoice - totalPendingInstallments`

### Arquivo a alterar: `src/pages/CreditCards.tsx`

- No componente `CreditCardComponent`: receber o valor pendente do cartao como prop e subtrair do `availableLimit`
- No card de resumo "Limite Disponivel": ja usa `totalAvailable` do hook, entao atualiza automaticamente
- Adicionar subtexto mostrando quanto e de parcelas futuras (ex: "inclui R$ 7.742,84 em parcelas futuras")

### Calculo por cartao

```text
availableLimit = credit_limit - current_invoice - pendingFutureAmount
usagePercent = (current_invoice + pendingFutureAmount) / credit_limit * 100
```

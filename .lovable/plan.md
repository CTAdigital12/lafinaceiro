
# Corrigir Reconciliacao de Faturas de Cartao de Credito

## Problema Identificado

A reconciliacao compara valores incompativeis:

```text
Valor mostrado como "Banco":     R$ 5.196,39  (current_invoice = saldo GLOBAL do cartao)
Valor de "Lancamentos":          R$ 63.252,12 (transacoes apenas de Fevereiro)
"Diferenca":                     R$ -58.055,73 (nao faz sentido)
```

O campo `current_invoice` e um saldo acumulado de TODOS os meses (despesas - estornos - pagamentos = 109.653,78 - 471,49 - 103.985,90 = 5.196,39). Ele NAO representa o valor da fatura de um mes especifico.

O "residual" de R$ 5.196,39 tambem e esse saldo global sendo mostrado como se fosse do mes atual.

## Solucao

Mudar a logica de reconciliacao para usar dados POR MES em vez do saldo global:

1. **Valor da Fatura do Mes**: Usar `closed_amount` da tabela `credit_card_invoices` quando a fatura estiver fechada (ex: Fev tem closed_amount = 63.252,12). Se aberta, usar o total de transacoes do mes.
2. **Pagamentos do Mes**: Ja funciona corretamente (soma de is_card_payment no periodo).
3. **Diferenca**: Comparar fatura do mes vs transacoes do mes (deveria ser ~0 se tudo estiver registrado).
4. **Status Pago**: Comparar transacoes do mes vs pagamentos do mes (em vez de usar current_invoice global).

### Exemplo corrigido para Fevereiro 2026:

```text
Fatura (fechada):    R$ 63.252,12 (vem de credit_card_invoices.closed_amount)
Lancamentos:         R$ 63.252,12 (soma das transacoes de fev)
Diferenca:           R$ 0,00
Pagamentos:          R$ 63.252,12 (Baixa Corp 56.891,18 + Pessoal 6.360,94)
Status:              Paga (pagamentos >= fatura)
```

## Secao Tecnica

### Arquivo a alterar: `src/hooks/useCreditCardReconciliation.ts`

**Mudancas na query:**
- Buscar `credit_card_invoices` para o mes/ano selecionado para obter `closed_amount` e `status`

**Mudancas no calculo por cartao:**
- `bankInvoice`: usar `closed_amount` da invoice se existir, senao usar `transactionsTotal` (fatura aberta = total de lancamentos)
- `isPaid`: comparar `paidAmount >= transactionsTotal` (pagamentos cobrem os lancamentos do mes)
- `difference`: `bankInvoice - transactionsTotal` (quando fechada, mostra se ha lancamentos faltando vs valor fechado)
- Remover dependencia de `card.current_invoice` e `card.status` para logica mensal

**Calculo detalhado:**
```text
bankInvoice = closedAmount ?? transactionsTotal  (por mes, nao global)
isPaid = paidAmount >= transactionsTotal && transactionsTotal > 0
difference = bankInvoice - transactionsTotal      (divergencia real do mes)
hasDiscrepancy = |difference| > 0.01 && !isPaid
```

### Arquivo a alterar: `src/components/modals/PayInvoiceModal.tsx`

**Mudanca no calculo do residual:**
- O `totalInvoice` nao deve ser `current_invoice` (global). Deve ser o total de transacoes do mes (corporativo + pessoal + reembolsavel).
- Residual = valor fechado da fatura (closed_amount) - transacoes registradas no mes. Se nao ha invoice fechada, residual = 0.
- Isso elimina o "residual fantasma" de R$ 5.196,39 que vinha do saldo global.

**Logica corrigida:**
```text
totalInvoice = closedAmount ?? transactionsTotal  (por mes)
residual = max(0, totalInvoice - transactionsTotal)
```

### Arquivo a alterar: `src/hooks/useInvoiceTransactions.ts`

- Adicionar query para buscar `credit_card_invoices` do mes/ano
- Expor `closedAmount` e `invoiceStatus` para uso no PayInvoiceModal

### Impacto

- ReconciliationCard: os valores de "Banco" e "Diferenca" passam a fazer sentido por mes
- PayInvoiceModal: residual so aparece quando closed_amount > transactionsTotal (diferenca real, nao saldo global)
- Nenhuma tabela nova, nenhuma migracao
- O campo `current_invoice` do cartao continua existindo para exibicao geral (saldo total do cartao), mas NAO e mais usado para reconciliacao mensal

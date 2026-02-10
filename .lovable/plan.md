

# Correção: Parcelas pendentes de fevereiro 2026 ainda não atualizadas

## Problema

A atualização SQL anterior usou o intervalo de datas errado: `2025-02-01` a `2025-02-28` em vez de `2026-02-01` a `2026-02-28`. Por isso, as 17 parcelas pendentes de fevereiro continuam com status "pending" e nao sao contabilizadas na conciliacao.

Alem disso, o campo `current_invoice` do cartao de credito armazena o valor R$ 61.428,85 e precisa ser recalculado apos a ativacao das parcelas.

## Solucao

Duas acoes manuais no banco de dados:

**1. Atualizar as 17 parcelas de fevereiro 2026 para "completed":**

```sql
UPDATE transactions 
SET status = 'completed' 
WHERE status = 'pending' 
  AND credit_card_id IS NOT NULL 
  AND type = 'expense' 
  AND due_date >= '2026-02-01' 
  AND due_date <= '2026-02-28';
```

**2. Recalcular o `current_invoice` do cartao** usando a funcao `syncInvoiceForCard` ja existente no sistema (sera acionada automaticamente ao recarregar a pagina), ou executar o recalculo via botao de sync existente na interface.

## Impacto

- As 17 parcelas serao contabilizadas na conciliacao
- O valor total deve subir de R$ 61.428,85 para aproximadamente R$ 63.252,12
- Nenhuma alteracao de codigo necessaria -- apenas correcao dos dados




# Plano: Corrigir Vinculação de Pagamentos ao Cartão

## Problema Identificado

A transação de pagamento pessoal não está vinculada ao cartão de crédito:

| Transação | Valor | `credit_card_id` | Status |
|-----------|-------|------------------|--------|
| Baixa Corporativa | R$ 28.586,73 | `af7803d9-...` | Vinculado ao cartão |
| FATURA PAGA PERSON MULTI | R$ 12.053,15 | **`NULL`** | Não vinculado ao cartão |
| Residual (R$ 93,90) | - | - | Não registrado como pagamento |

Por isso a reconciliação mostra diferença de R$ 12.147,05:
- Total lançamentos: R$ 40.733,78
- Pagamentos encontrados: R$ 28.586,73 (só o corporativo, porque tem `credit_card_id`)
- Diferença: R$ 12.147,05

## Solução

Há duas abordagens possíveis:

### Opção A: Correção Manual dos Dados (Recomendada)

Atualizar a transação existente para vincular ao cartão correto:

```sql
-- Vincular pagamento pessoal ao cartão
UPDATE transactions 
SET credit_card_id = 'af7803d9-fee2-4c24-a38f-50b312ef2245'
WHERE id = '73e1331a-29db-4448-85ed-62b35281e34c';
```

E criar a transação do pagamento residual (R$ 93,90) se ainda não existir.

### Opção B: Melhorar a Lógica do Sistema (Alternativa)

Modificar o modal de pagamento para garantir que **todas** as transações de pagamento (`is_card_payment = true`) sejam vinculadas ao cartão correspondente.

**Arquivo:** `src/components/modals/PayInvoiceModal.tsx`

Na função de criar transação de pagamento, garantir que `credit_card_id` seja sempre preenchido:

```typescript
// Ao criar transação de pagamento
const paymentTransaction = {
  description: `Pagamento Fatura - ${creditCard.name}`,
  amount: totalToPay,
  type: "income", // ou "expense" dependendo da conta
  is_card_payment: true,
  credit_card_id: creditCard.id, // SEMPRE vincular ao cartão
  account_id: selectedAccountId,
  // ...
};
```

## Arquivos a Modificar

1. **Correção de Dados (via SQL)**
   - Atualizar `credit_card_id` da transação de R$ 12.053,15
   - Opcionalmente criar transação de R$ 93,90 como pagamento

2. **`src/components/modals/PayInvoiceModal.tsx`**
   - Garantir que transações de pagamento sempre tenham `credit_card_id` preenchido
   - Revisar lógica de criação de transações de baixa

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| Pagamentos: R$ 28.586,73 | Pagamentos: R$ 40.733,78 |
| Diferença: R$ 12.147,05 | Diferença: R$ 0,00 |
| Status: Divergência | Status: Paga |


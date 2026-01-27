

# Plano: Corrigir Vinculação do Pagamento Residual

## Problema Identificado

A transação de pagamento residual de R$ 93,90 não está vinculada ao cartão de crédito:

| Campo | Valor |
|-------|-------|
| `id` | `27539968-e9cc-4c8f-807b-51e6b61aac79` |
| `description` | "PAG BOLETO ITAU UNIBANCO HOLDING S A" |
| `amount` | R$ 93,90 |
| `is_card_payment` | `true` |
| `credit_card_id` | **`NULL`** (deveria ser o ID do cartão) |
| `date` | 2026-01-15 |

Por isso a reconciliação ainda mostra R$ 93,90 de diferença:
- Total lançamentos: R$ 40.733,78
- Pagamentos encontrados: R$ 40.639,88 (corporativo + pessoal)
- Diferença: R$ 93,90 (este pagamento não está vinculado)

## Solução

Atualizar a transação para vincular ao cartão correto:

```sql
UPDATE transactions 
SET credit_card_id = 'af7803d9-fee2-4c24-a38f-50b312ef2245'
WHERE id = '27539968-e9cc-4c8f-807b-51e6b61aac79';
```

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| Pagamentos: R$ 40.639,88 | Pagamentos: R$ 40.733,78 |
| Diferença: R$ 93,90 | Diferença: R$ 0,00 |
| Status: Divergência | Status: Paga |

## Arquivos a Modificar

1. **Correção de Dados (via SQL)**
   - Atualizar `credit_card_id` da transação de R$ 93,90


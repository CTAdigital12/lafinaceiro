

# Plano: Corrigir Reconciliação para Faturas Pagas

## Problema Identificado

A tela de "Conciliação de Faturas" mostra divergência mesmo quando a fatura já foi paga:

| Campo | Valor | Problema |
|-------|-------|----------|
| Total Banco | R$ 0,00 | Correto - fatura foi paga |
| Total Lançamentos | R$ 40.733,78 | Transações ainda existem no histórico |
| Diferença | -R$ 40.733,78 | Sistema considera como divergência |
| Status do Cartão | "Paga" | Deveria indicar que está tudo certo |

**Causa raiz**: A reconciliação compara `current_invoice` (zerado após pagamento) com a soma das transações do período (que continuam existindo). Não considera que a fatura já foi quitada.

## Solução Proposta

Modificar a lógica de reconciliação para:
1. Detectar quando a fatura foi paga (status = "paid" OU `current_invoice = 0`)
2. Considerar as transações de pagamento (`is_card_payment = true`) como "baixa" do período
3. Marcar como "Conciliado" quando: `transactionsTotal ≈ soma dos pagamentos`

## Mudanças Técnicas

### Arquivo 1: `src/hooks/useCreditCardReconciliation.ts`

**Alterações na query (linhas 64-84):**
- Buscar também as transações de pagamento (`is_card_payment = true`) do período para contabilizar a baixa

**Alterações no cálculo (linhas 86-155):**
```typescript
// Adicionar: buscar pagamentos do período
const paymentTransactions = transactions.filter(
  (t) => t.credit_card_id === card.id && t.is_card_payment === true
);

// Soma dos pagamentos realizados no período
const paidAmount = paymentTransactions.reduce(
  (sum, t) => sum + Number(t.amount), 0
);

// Nova lógica de diferença:
// Se bankInvoice = 0 e há pagamentos, a diferença é:
// transactionsTotal - paidAmount (deve ser ~0 se tudo foi pago)
const isPaid = card.status === 'paid' || bankInvoice === 0;
const effectiveDifference = isPaid 
  ? transactionsTotal - paidAmount  // Comparar lançamentos vs pagamentos
  : bankInvoice - transactionsTotal; // Comparar banco vs lançamentos

// Divergência só se a diferença efetiva for significativa
const hasDiscrepancy = Math.abs(effectiveDifference) > 0.01 && !isPaid;
```

**Adicionar ao retorno:**
```typescript
return {
  // ... campos existentes
  isPaid: isPaid,
  paidAmount: paidAmount,
  effectiveDifference: effectiveDifference,
};
```

### Arquivo 2: `src/components/credit-cards/ReconciliationCard.tsx`

**Alterações no CardReconciliationItem (linhas 25-112):**
- Se `card.isPaid === true`, mostrar badge "Paga" em vez de "Divergência"
- Ocultar a mensagem de alerta quando a fatura está paga

**Alterações no componente principal (linhas 115-287):**
- Ajustar `hasAnyDiscrepancy` para não considerar cartões pagos
- Mostrar mensagem diferente para faturas pagas: "Fatura quitada em [data]"

### Interface CardReconciliation

**Adicionar novos campos:**
```typescript
export interface CardReconciliation {
  // ... campos existentes
  isPaid: boolean;           // Se a fatura está quitada
  paidAmount: number;        // Total pago no período
  effectiveDifference: number; // Diferença real (considerando pagamentos)
}
```

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Fatura R$ 0, transações R$ 40.733, paga | "Divergência R$ -40.733" | "Paga ✓" |
| Fatura R$ 93,90, transações R$ 40.733 | "Divergência R$ -40.639" | "Divergência R$ 93,90" (valor real) |
| Fatura R$ 1.000, transações R$ 1.000 | "Conciliado ✓" | Sem mudança |

## Arquivos a Modificar

1. **`src/hooks/useCreditCardReconciliation.ts`**
   - Buscar transações de pagamento na query
   - Calcular `paidAmount` e `isPaid`
   - Ajustar lógica de `difference` e `hasDiscrepancy`
   - Adicionar novos campos ao retorno

2. **`src/components/credit-cards/ReconciliationCard.tsx`**
   - Mostrar status "Paga" para faturas quitadas
   - Não mostrar alerta de divergência quando paga
   - Ajustar mensagens e ícones

3. **`src/hooks/useCreditCards.ts`** (opcional)
   - Verificar se o status do cartão está sendo passado corretamente


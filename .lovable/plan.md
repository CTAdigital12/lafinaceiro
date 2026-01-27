
# Plano: Corrigir Lógica de Exibição do Saldo Residual (v2)

## Diagnóstico Detalhado

Analisando o banco de dados e o código, identifiquei o problema:

| Variável | Valor Atual | Origem |
|----------|-------------|--------|
| `current_invoice` do cartão | R$ 93,90 | Tabela `credit_cards` |
| `corporateTotal` | ~R$ 28.680 | Calculado das transações do período |
| `myTotalToPay` | ~R$ 12.053 | Calculado das transações do período |
| `hasTransactionsToPay` | `true` | Porque totais > 0 |
| `calculatedResidual` | `0` | `Max(0, 93.90 - 40.733) = 0` |
| **Resultado** | Seção não aparece | ❌ |

**Causa raiz**: As transações antigas ainda existem no banco (a empresa pagou R$ 28.586,73, você pagou R$ 93,90). O sistema não "limpa" transações após pagamento - apenas atualiza o `current_invoice`. Por isso, ao calcular os totais, ele ainda vê R$ 40.733+ em transações.

## Solução

Detectar quando `current_invoice < transactionsTotal` (fatura parcialmente paga) e tratar TODO o saldo restante como residual, ocultando as seções de transações já pagas.

## Mudanças Técnicas

### Arquivo: `src/components/modals/PayInvoiceModal.tsx`

**Linhas 129-136 - Adicionar detecção de pagamento parcial:**

```typescript
const totalInvoice = Number(creditCard?.current_invoice || 0);
const transactionsTotal = corporateTotal + myTotalToPay;

// Detectar situação de pagamento parcial anterior:
// Se current_invoice < total das transações, significa que já pagou parte
// e o que sobra é residual (juros, taxas, ou diferença)
const isPartiallyPaid = totalInvoice < transactionsTotal && totalInvoice > 0;

// Se parcialmente pago, TODO o saldo restante é residual
// Caso contrário, calcular diferença entre fatura e transações
const calculatedResidual = isPartiallyPaid 
  ? totalInvoice 
  : Math.max(0, totalInvoice - transactionsTotal);

// Mostrar seção se há residual > 0
const hasResidualBalance = calculatedResidual > 0;

// Quando é pagamento parcial, ocultar seções de transações (já foram pagas)
const shouldHideTransactionSections = isPartiallyPaid;
```

**Linhas 168-180 - Ajustar inicialização do estado:**

```typescript
const transTotal = corporateTotal + myTotalToPay;
const isPartiallyPaid = Number(creditCard.current_invoice) < transTotal && Number(creditCard.current_invoice) > 0;

const residual = isPartiallyPaid 
  ? Number(creditCard.current_invoice) 
  : Math.max(0, Number(creditCard.current_invoice) - transTotal);

setResidualAmount(residual.toFixed(2));
setIncludeResidual(isPartiallyPaid && residual > 0); // Marcar automaticamente

// Quando parcialmente pago, desmarcar seções de transações
if (isPartiallyPaid) {
  setIncludeCorporate(false);
  setIncludePersonal(false);
}
```

**Linhas 385+ e 500+ - Ocultar seções de transações quando parcialmente pago:**

Na seção Corporativa (linha ~385):
```typescript
{corporateTotal > 0 && !shouldHideTransactionSections && (
  <Collapsible>...</Collapsible>
)}
```

Na seção Pessoal (linha ~440+):
```typescript
{!shouldHideTransactionSections && (
  <Collapsible>...</Collapsible>
)}
```

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Fatura R$ 93,90, transações R$ 40.733 | Seção não aparece, mostra "Corporativo R$ 28k" | Mostra apenas "Saldo Residual R$ 93,90" com checkbox marcado |
| Fatura R$ 50.000, transações R$ 40.000 | Mostra R$ 10.000 residual | Sem mudança |
| Fatura R$ 0 | Não aparece | Não aparece |

## Arquivos a Modificar

1. **`src/components/modals/PayInvoiceModal.tsx`**
   - Linhas 129-136: Adicionar detecção de `isPartiallyPaid` e ajustar `calculatedResidual`
   - Linhas 168-180: Ajustar inicialização dos estados para marcar residual automaticamente
   - Linha ~385: Ocultar seção corporativa quando `shouldHideTransactionSections`
   - Linha ~440+: Ocultar seção pessoal quando `shouldHideTransactionSections`


# Mostrar reembolsos corporativos na conciliacao

## Problema

A conciliacao mostra o total de despesas corporativas (R$ 56.891) mas nao indica que esses valores ja foram reembolsados pela empresa. O campo `reimbursement_status` existe nas transacoes mas nao e utilizado pelo hook de conciliacao nem pela interface.

O usuario precisa ver claramente:
- Quanto das despesas corporativas ja foi reembolsado
- Quanto ainda esta pendente de reembolso
- Qual e o valor liquido que ele pessoalmente deve

## Alteracoes

### 1. Hook `useCreditCardReconciliation.ts`

- Adicionar `reimbursement_status` na query de transacoes (o campo ja existe na tabela, so precisa ser incluido no select)
- Calcular novos campos por cartao:
  - `corporateReimbursed`: soma das despesas corporativas com reimbursement_status = 'reimbursed'
  - `corporatePending`: soma das despesas corporativas com reimbursement_status != 'reimbursed'
- Adicionar esses campos na interface `CardReconciliation`
- Adicionar totais no `ReconciliationSummary`

### 2. Componente `ReconciliationCard.tsx`

- Na secao de detalhes por cartao, mostrar o valor corporativo reembolsado com um icone de check verde (ex: "Empresa: R$ 56.891 - Reembolsado: R$ 56.891")
- Mostrar pendente de reembolso quando existir

### 3. Componente `ReconciliationDetailModal.tsx` e `InvoiceBreakdownCard.tsx`

- Adicionar `reimbursement_status` na interface de Transaction usada nesses componentes
- No breakdown, apos mostrar "Empresa: R$ X", detalhar quanto ja foi reembolsado vs pendente
- Na badge de stats, diferenciar entre corporativo reembolsado e pendente

## Detalhes tecnicos

No hook, a query ja busca todas as transacoes com credit_card_id. So precisa incluir o campo `reimbursement_status` no select:

```typescript
// Na query existente, adicionar reimbursement_status
.select("*, categories(name, icon)")
// Muda para:
.select("*, categories(name, icon), reimbursement_status")
// Na verdade o * ja inclui, entao reimbursement_status ja vem. 
// O problema e que o calculo nao usa esse campo.
```

No calculo por cartao:

```typescript
// Separar corporate por status de reembolso
const corporateReimbursed = normalTransactions
  .filter(t => t.is_corporate_expense && t.reimbursement_status === 'reimbursed')
  .reduce((sum, t) => sum + Number(t.amount), 0);

const corporatePending = corporateTotal - corporateReimbursed;
```

Na interface `CardReconciliation`, adicionar:

```typescript
corporateReimbursed: number;
corporatePending: number;
```

No `ReconciliationCard.tsx`, na area que mostra "Empresa: R$ X", trocar para mostrar detalhamento:

```tsx
{card.corporateReimbursed > 0 && (
  <div className="flex items-center gap-1">
    <CheckCircle className="h-3 w-3 text-income" />
    <span className="text-income">Reembolsado: {formatCurrency(card.corporateReimbursed)}</span>
  </div>
)}
{card.corporatePending > 0 && (
  <div className="flex items-center gap-1">
    <Clock className="h-3 w-3" />
    <span>Pendente: {formatCurrency(card.corporatePending)}</span>
  </div>
)}
```

No summary cards do topo, adicionar um card ou sub-info mostrando "Reembolsado pela empresa" com o total.



## Auditoria de Scroll Mobile - Problemas Encontrados

Após analisar todos os componentes, identifiquei os seguintes modais que usam `Dialog` diretamente (em vez de `ResponsiveDialog`) e podem cortar conteúdo no mobile por não se adaptarem como Drawer:

### Modais com problema potencial de scroll no mobile

Estes usam `Dialog` com `overflow-y-auto` mas **não** convertem para `Drawer` no mobile, o que pode causar corte de conteúdo em telas pequenas:

1. **`TransactionFiltersModal.tsx`** - Modal de filtros avançados (689 linhas, muito conteúdo)
2. **`PayInvoiceModal.tsx`** - Modal de pagamento de fatura
3. **`NewBudgetModal.tsx`** - Modal de nova meta de orçamento
4. **`EditBudgetModal.tsx`** - Modal de edição de orçamento
5. **`AccountImportModal.tsx`** - Modal de importação de extrato
6. **`InvoiceImportModal.tsx`** - Modal de importação de fatura
7. **`InvoiceReviewModal.tsx`** - Modal de revisão de fatura (1277 linhas, o maior)
8. **`InvoiceItemsModal.tsx`** - Modal de itens da fatura
9. **`AccountReviewModal.tsx`** - Modal de revisão de conta
10. **`UpdatePricesModal.tsx`** (investments) - Modal de atualização de preços
11. **`SpreadsheetReconciliationModal.tsx`** - Modal de reconciliação
12. **`ReconciliationDetailModal.tsx`** - Detalhes de reconciliação
13. **`CloseInvoiceModal.tsx`** / **`ReopenInvoiceModal.tsx`** - Modais de fatura

### Modais que já estão OK
- `TransactionModal`, `AccountModal`, `CreditCardModal`, `RecurringRuleModal`, `AddInstallmentsModal`, `EditInstallmentsModal` - usam `ResponsiveDialog` (converte para Drawer no mobile)
- `CategoryDetailSheet`, `ParentCategoryDetailSheet` - já usam Drawer no mobile com `data-vaul-no-drag`
- `BottomNav` - já corrigido com ScrollArea

### Plano de Correção

Migrar os modais mais críticos (os que o usuário mais acessa no mobile) de `Dialog` para `ResponsiveDialog`, que já tem tratamento de scroll e `data-vaul-no-drag` embutido.

**Prioridade alta** (mais usados no mobile):
1. `TransactionFiltersModal.tsx` - Converter para `ResponsiveDialog`
2. `PayInvoiceModal.tsx` - Converter para `ResponsiveDialog`
3. `NewBudgetModal.tsx` - Converter para `ResponsiveDialog`
4. `EditBudgetModal.tsx` - Converter para `ResponsiveDialog`

**Prioridade média** (importações/revisões, menos frequentes):
5. `AccountImportModal.tsx` - Converter para `ResponsiveDialog`
6. `InvoiceImportModal.tsx` - Converter para `ResponsiveDialog`
7. `InvoiceReviewModal.tsx` - Converter para `ResponsiveDialog`
8. `InvoiceItemsModal.tsx` - Converter para `ResponsiveDialog`

**Prioridade baixa** (modais complexos com layout especial):
9-13. Modais de reconciliação e review (estes têm layouts mais complexos com flex columns e podem precisar de adaptação individual)

Para cada modal, a conversão envolve:
- Substituir `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` por `ResponsiveDialog`
- Mover o conteúdo para dentro do `ResponsiveDialog` como children
- Remover classes de `max-h` e `overflow-y-auto` (o ResponsiveDialog já cuida disso)


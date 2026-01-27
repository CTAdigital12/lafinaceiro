

## Plano: Fluxo Granular de Pagamento de Fatura (Split Payment)

### Resumo

Redesign completo da modal "Pagar Fatura" para permitir pagamentos divididos entre gastos corporativos (pagos pela empresa, sem débito bancário) e gastos pessoais (pagos via conta bancária ou externamente).

---

## Parte 1: UI - Redesign da Modal PayInvoiceModal

### 1.1 Estrutura Visual Nova

A modal será dividida em seções claras:

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ 💳 Pagar Fatura - Itaú Personnalité Black                                 │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  📊 COMPOSIÇÃO DA FATURA                                            │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │  Total da Fatura:              R$ 5.000,00                          │  │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  │
│  │  Gastos Corporativos:          R$ 2.000,00   [40%]                  │  │
│  │  Meu Saldo Devedor:            R$ 3.000,00   [60%]                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  🏢 SEÇÃO A: PARTE CORPORATIVA (R$ 2.000,00)                        │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │                                                                     │  │
│  │  [x] Baixar gastos corporativos automaticamente                     │  │
│  │      Cria ajuste para zerar esta parte da dívida sem                │  │
│  │      debitar de conta bancária.                                     │  │
│  │                                                                     │  │
│  │  Valor a baixar: [R$ ___2.000,00____]                               │  │
│  │                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  👤 SEÇÃO B: MINHA PARTE (R$ 3.000,00)                              │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │                                                                     │  │
│  │  Como você vai pagar esta parte?                                    │  │
│  │                                                                     │  │
│  │  ( ) Débito em conta bancária                                       │  │
│  │      [Selecione a conta ▼] [R$ 22.450,00]                           │  │
│  │                                                                     │  │
│  │  ( ) Já paguei externamente                                         │  │
│  │      Não altera saldo de nenhuma conta, apenas baixa a fatura.      │  │
│  │                                                                     │  │
│  │  ── Conciliar com extrato ──                                        │  │
│  │  [ ] Vincular a transação existente no extrato                      │  │
│  │      [Selecione transação ▼] (PIX TRANSF FATURA... R$ 3.000,00)     │  │
│  │                                                                     │  │
│  │  Valor a pagar: [R$ ___3.000,00____]                                │  │
│  │                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  [📋 Revisar Itens Individualmente]                                       │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  📝 RESUMO DA OPERAÇÃO                                              │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │  • Baixa corporativa: R$ 2.000,00                                   │  │
│  │  • Débito na conta Itaú: R$ 3.000,00                                │  │
│  │  • Nova fatura após pagamento: R$ 0,00                              │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  📅 Data do Pagamento: [27/01/2026]                                       │
│                                                                           │
│                          [Cancelar]  [Confirmar Pagamento]                │
└───────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Modal de Revisão de Itens (Opcional)

Ao clicar em "Revisar Itens Individualmente":

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  📋 REVISAR ITENS DA FATURA                              [Fechar]       │
├─────────────────────────────────────────────────────────────────────────┤
│  Marque os itens que serão incluídos no pagamento de hoje:              │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ [x] LINKEDIN - 15/12               🏢 Corporativo    R$   980,00  │  │
│  │ [x] GOOGLE ADS - 15/12             🏢 Corporativo    R$ 1.020,00  │  │
│  │ [x] AMAZON BR - 18/12              👤 Pessoal        R$   299,99  │  │
│  │ [x] SUPERMERCADO XYZ - 20/12       👤 Pessoal        R$   450,00  │  │
│  │ [ ] CURSO UDEMY - 22/12            🏢 Corporativo    R$   300,00  │  │
│  │ [x] RESTAURANTE ABC - 25/12        👤 Pessoal        R$   150,00  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  Selecionados: 5 de 6 itens                                             │
│  Total Corporativo Selecionado: R$ 2.000,00                             │
│  Total Pessoal Selecionado: R$ 899,99                                   │
│                                                                         │
│                                              [Aplicar Seleção]          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Parte 2: Lógica de Pagamento (Backend)

### 2.1 Parâmetros do Split Payment

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `corporateAmount` | number | Valor da baixa corporativa |
| `corporateAuto` | boolean | Se deve baixar automaticamente |
| `personalAmount` | number | Valor da parte pessoal |
| `personalPaymentType` | 'bank' \| 'external' | Origem do pagamento pessoal |
| `accountId` | string \| null | ID da conta bancária (se bank) |
| `linkToTransactionId` | string \| null | Vincular a transação existente |
| `date` | string | Data do pagamento |
| `selectedItems` | string[] \| null | IDs de transações selecionadas manualmente |

### 2.2 Transações Geradas

Dependendo das escolhas, o sistema gerará:

**Cenário 1: Baixa Corporativa (empresa pagou)**
```sql
INSERT INTO transactions (
  type: 'income',          -- Crédito na fatura
  is_card_payment: true,   -- Marca como operação de fatura
  description: 'Baixa Corporativa - [Nome Cartão]',
  amount: 2000,
  credit_card_id: '[ID]',
  account_id: NULL,        -- Não debita de conta
  date: '2026-01-27'
);
```

**Cenário 2: Pagamento Pessoal via Conta Bancária**
```sql
-- Transação na conta (débito)
INSERT INTO transactions (
  type: 'expense',
  is_card_payment: true,
  description: 'Pagamento de fatura - [Nome Cartão]',
  amount: 3000,
  account_id: '[BANK_ID]',
  credit_card_id: NULL,    -- Não é gasto do cartão
  date: '2026-01-27'
);
```

**Cenário 3: Pagamento Pessoal Externo (já pago)**
```sql
INSERT INTO transactions (
  type: 'income',          -- Crédito na fatura
  is_card_payment: true,
  description: 'Pagamento Externo - [Nome Cartão]',
  amount: 3000,
  credit_card_id: '[ID]',
  account_id: NULL,
  date: '2026-01-27'
);
```

**Cenário 4: Vincular a Transação Existente**
```sql
-- Atualiza transação existente para marcar como pagamento de fatura
UPDATE transactions 
SET is_card_payment = true
WHERE id = '[EXISTING_TX_ID]';
-- NÃO cria nova transação, apenas vincula
```

### 2.3 Atualização do Saldo da Fatura

```sql
UPDATE credit_cards 
SET current_invoice = current_invoice - (corporateAmount + personalAmount),
    status = CASE WHEN new_invoice = 0 THEN 'paid' ELSE 'open' END
WHERE id = '[CARD_ID]';
```

---

## Parte 3: Implementação Técnica

### 3.1 Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/modals/PayInvoiceModal.tsx` | Redesign completo com split payment |
| `src/hooks/useCreditCards.ts` | Nova mutation `paySplitInvoice` |
| `src/hooks/useCreditCardReconciliation.ts` | Hook já calcula corporateTotal/personalTotal - reutilizar |

### 3.2 Novo Hook para Transações do Período

Criar função para buscar transações da fatura atual para seleção manual:

```typescript
// Em useCreditCardReconciliation.ts ou novo hook
function useCurrentInvoiceTransactions(creditCardId: string, month: number, year: number) {
  // Busca transações do período com due_date na fatura atual
  // Retorna lista com campos: id, description, amount, is_corporate_expense, date
}
```

### 3.3 Hook para Transações Bancárias Candidatas

Para o "Check de Conciliação" - buscar transações da conta que podem ser o pagamento:

```typescript
function useBankPaymentCandidates(invoiceAmount: number, dueDate: Date) {
  // Busca transações em contas bancárias próximas ao valor/data
  // Filtra: type='expense', amount similar, date próximo ao vencimento
  // Exclui transações já marcadas como is_card_payment
}
```

### 3.4 Interface do State

```typescript
interface SplitPaymentState {
  // Composição
  totalInvoice: number;
  corporateTotal: number;
  personalTotal: number;
  
  // Seção A - Corporativo
  includeCorporate: boolean;
  corporateAmount: number;
  
  // Seção B - Pessoal
  includePersonal: boolean;
  personalAmount: number;
  personalPaymentType: 'bank' | 'external';
  selectedAccountId: string | null;
  linkToExistingTransaction: boolean;
  linkedTransactionId: string | null;
  
  // Seleção Manual
  manualSelection: boolean;
  selectedTransactionIds: string[];
  
  // Geral
  paymentDate: Date;
}
```

---

## Parte 4: Fluxo de Dados

```text
┌─────────────────┐
│ Modal Abre      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Buscar transações da fatura atual               │
│ useCreditCardReconciliation(cardId, month, year)│
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Calcular composição:                            │
│ - corporateTotal (is_corporate_expense = true)  │
│ - personalTotal (is_corporate_expense = false)  │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Preencher estado inicial:                       │
│ - corporateAmount = corporateTotal              │
│ - personalAmount = personalTotal                │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Usuário escolhe opções de pagamento             │
│ (checkboxes, seletores, valores)                │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Ao confirmar: paySplitInvoice.mutateAsync()     │
│ 1. Criar transações conforme escolhas           │
│ 2. Atualizar saldo da conta (se bank)           │
│ 3. Atualizar fatura do cartão                   │
│ 4. Vincular transação existente (se selecionado)│
└─────────────────────────────────────────────────┘
```

---

## Parte 5: Considerações de Segurança e UX

### 5.1 Validações

- Soma de corporateAmount + personalAmount não pode exceder current_invoice
- Se "banco" selecionado, verificar se conta tem saldo suficiente
- Se "vincular transação", verificar se transação não está já vinculada
- Valor mínimo de pagamento: R$ 0,01 para cada seção ativa

### 5.2 Feedback Visual

- Progress bar mostrando quanto da fatura será paga
- Cores diferenciadas para corporativo (cinza/neutro) e pessoal (azul)
- Alerta se valores não batem com totais calculados
- Preview do extrato/fatura após pagamento

### 5.3 Mobile-First

- Seções colapsáveis em telas pequenas
- Scroll suave entre seções
- Botões de ação fixos no rodapé

---

## Resumo de Arquivos

| Arquivo | Ação | Linhas Estimadas |
|---------|------|------------------|
| `src/components/modals/PayInvoiceModal.tsx` | Reescrever | ~400 linhas |
| `src/hooks/useCreditCards.ts` | Adicionar `paySplitInvoice` | ~80 linhas |
| `src/hooks/useCreditCardReconciliation.ts` | Adicionar query de transações individuais | ~30 linhas |
| `src/hooks/useBankPaymentCandidates.ts` | Criar (para conciliação) | ~50 linhas |

---

## Ordem de Implementação

1. Criar hook `useBankPaymentCandidates` para buscar transações bancárias candidatas
2. Adicionar query de transações individuais no `useCreditCardReconciliation`
3. Implementar mutation `paySplitInvoice` no `useCreditCards`
4. Redesign completo do `PayInvoiceModal` com nova UI
5. Adicionar modal de seleção manual de itens
6. Testes de integração com cenários de pagamento misto


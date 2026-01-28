
# Implementação de Ciclos de Fatura

## Visão Geral

Este plano implementa um sistema de ciclos de fatura com estados (Aberta/Fechada/Paga), permitindo travar alterações em meses já conferidos e garantindo integridade dos dados históricos.

---

## Fase 1: Schema do Banco de Dados

### Nova Tabela: `credit_card_invoices`

```sql
CREATE TABLE credit_card_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  credit_card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid')),
  closed_amount NUMERIC DEFAULT NULL,
  due_date DATE DEFAULT NULL,
  closing_date DATE DEFAULT NULL,
  closed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(credit_card_id, month, year)
);

-- RLS Policies
ALTER TABLE credit_card_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoices" ON credit_card_invoices
  FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY "Users can insert own invoices" ON credit_card_invoices
  FOR INSERT WITH CHECK (auth.uid() = user_id);
  
CREATE POLICY "Users can update own invoices" ON credit_card_invoices
  FOR UPDATE USING (auth.uid() = user_id);
  
CREATE POLICY "Users can delete own invoices" ON credit_card_invoices
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_credit_card_invoices_updated_at
  BEFORE UPDATE ON credit_card_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Fase 2: Novo Hook - `useInvoiceCycles`

### Arquivo: `src/hooks/useInvoiceCycles.ts`

| Funcionalidade | Descrição |
|----------------|-----------|
| `getInvoiceStatus` | Retorna status da fatura para um cartao/mes/ano |
| `closeInvoice` | Fecha a fatura, travando edicoes |
| `reopenInvoice` | Reabre a fatura para permitir alteracoes |
| `isInvoiceClosed` | Verifica se a fatura esta fechada |
| `validateTransactionModification` | Valida se uma transacao pode ser modificada |

```text
+------------------+      +-------------------+
|  useInvoiceCycles |----->|  credit_card_     |
|                  |      |  invoices (DB)    |
+------------------+      +-------------------+
        |
        v
+-------------------+
| validateTransaction|
| Modification()    |
+-------------------+
        |
        +---> Bloqueia se fatura fechada
        +---> Retorna erro amigavel
```

---

## Fase 3: Integracao com Transacoes

### Modificacoes em `useTransactions.ts`

As mutacoes `createTransaction`, `updateTransaction` e `deleteTransaction` serao modificadas para:

1. Calcular a competencia (mes/ano) baseada em `due_date`
2. Consultar `credit_card_invoices` para verificar status
3. Se `status === 'closed'`, bloquear e retornar erro

```typescript
// Pseudo-codigo da validacao
const validateInvoiceOpen = async (creditCardId, dueDate) => {
  if (!creditCardId) return; // Nao e cartao de credito
  
  const { month, year } = extractMonthYear(dueDate);
  const invoice = await getInvoice(creditCardId, month, year);
  
  if (invoice?.status === 'closed') {
    throw new Error(
      "Esta fatura esta fechada. Por seguranca, voce precisa reabri-la antes de modificar lancamentos."
    );
  }
};
```

---

## Fase 4: Interface de Usuario

### 4.1 Card de Reconciliacao Atualizado

No `ReconciliationCard.tsx`, adicionar:

- Indicador de status: "Aberta" (verde) ou "Fechada" (cinza com cadeado)
- Botao "Fechar Fatura" (Lock) quando aberta
- Botao "Reabrir Fatura" (Unlock, amarelo) quando fechada

```text
+----------------------------------------+
| Conciliacao - Jan 2026                 |
| [Aberta]  [Fechar Fatura 🔒]          |
+----------------------------------------+
| Banco: R$ 3.500,00                     |
| Lancamentos: R$ 3.500,00               |
| Diferenca: R$ 0,00 ✓                   |
+----------------------------------------+
```

### 4.2 Banner de Fatura Fechada

Quando a fatura estiver fechada, exibir banner no topo da lista de transacoes:

```text
+----------------------------------------+
| ⚠️ Fatura Fechada                      |
| Esta fatura foi conferida e fechada.   |
| [Reabrir para Editar]                  |
+----------------------------------------+
```

### 4.3 Desabilitacao de Controles

Quando fechada:
- Checkbox de selecao: desabilitado
- Botao de editar: desabilitado ou oculto
- Botao de excluir: desabilitado ou oculto
- Menu de acoes: mostra "Reabrir Fatura" como opcao

---

## Fase 5: Fluxo de Fechamento

### Ao clicar "Fechar Fatura":

1. Calcular somatorio final de transacoes do periodo
2. Criar/Atualizar registro em `credit_card_invoices`:
   - `status = 'closed'`
   - `closed_amount = somatorio`
   - `closed_at = now()`
   - `due_date = data de vencimento calculada`
   - `closing_date = data de fechamento efetiva`
3. Exibir confirmacao com valor total e data
4. Atualizar UI para estado "Fechada"

---

## Fase 6: Integracao com Importacao

### Modificacoes em `InvoiceReviewModal.tsx`

Antes de importar, verificar se a competencia da transacao cai em fatura fechada:

```typescript
// Para cada item a importar
const invoiceStatus = await checkInvoiceStatus(creditCardId, item.due_date);

if (invoiceStatus === 'closed') {
  // Acumular itens de fatura fechada
  closedInvoiceItems.push(item);
}

// Se houver itens de fatura fechada, perguntar ao usuario
if (closedInvoiceItems.length > 0) {
  const shouldReopen = await confirmDialog({
    title: "Itens de Fatura Fechada",
    message: `Detectamos ${closedInvoiceItems.length} itens de uma fatura fechada. Deseja reabri-la para incluir?`,
    actions: ["Reabrir e Importar", "Ignorar Itens", "Cancelar"]
  });
  
  if (shouldReopen === "Reabrir e Importar") {
    await reopenInvoice(creditCardId, month, year);
  } else if (shouldReopen === "Ignorar Itens") {
    // Remove itens da importacao
  }
}
```

---

## Arquivos a Modificar/Criar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `supabase/migrations/xxx_create_invoice_cycles.sql` | Criar | Tabela e RLS |
| `src/integrations/supabase/types.ts` | Auto | Tipos gerados |
| `src/hooks/useInvoiceCycles.ts` | Criar | Hook principal |
| `src/hooks/useTransactions.ts` | Modificar | Adicionar validacao |
| `src/components/credit-cards/ReconciliationCard.tsx` | Modificar | UI de status |
| `src/components/credit-cards/InvoiceStatusBadge.tsx` | Criar | Componente badge |
| `src/components/credit-cards/CloseInvoiceModal.tsx` | Criar | Modal de fechamento |
| `src/components/modals/InvoiceReviewModal.tsx` | Modificar | Validacao na importacao |
| `src/components/modals/TransactionModal.tsx` | Modificar | Desabilitar se fechada |
| `src/pages/CreditCards.tsx` | Modificar | Integracao |
| `src/types/index.ts` | Modificar | Tipos de InvoiceCycle |

---

## Ordem de Implementacao

1. **Migracao do banco** - Criar tabela `credit_card_invoices`
2. **Hook useInvoiceCycles** - Logica de gerenciamento de ciclos
3. **Validacao em useTransactions** - Bloquear modificacoes em faturas fechadas
4. **UI de Status** - Badge e botoes no ReconciliationCard
5. **Modal de Fechamento** - Confirmacao e calculo do valor
6. **Banner de Fatura Fechada** - Feedback visual
7. **Integracao com Importacao** - Detectar e perguntar sobre faturas fechadas
8. **Testes** - Verificar fluxo completo

---

## Consideracoes de Seguranca

- RLS policies garantem isolamento por usuario
- Validacao server-side via RLS (usuario so altera suas faturas)
- Validacao client-side para UX (mensagens amigaveis)
- Historico de fechamento/reabertura (via `closed_at` e `updated_at`)

---

## Experiencia do Usuario

```text
Fluxo Tipico:
1. Usuario importa fatura de janeiro
2. Categoriza todas as transacoes
3. Confere totais (reconciliacao)
4. Clica "Fechar Fatura" ✓
5. Sistema trava alteracoes
6. Proximo mes, usuario repete processo

Se precisar corrigir:
1. Usuario tenta editar transacao de janeiro
2. Sistema mostra: "Fatura fechada. Reabra para editar."
3. Usuario clica "Reabrir Fatura"
4. Sistema exibe aviso amarelo
5. Usuario faz correcao
6. Usuario fecha fatura novamente
```

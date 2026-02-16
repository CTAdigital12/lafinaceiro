

# Modulo de Despesas Recorrentes e Projecao Financeira

## Resumo

Implementar um sistema de regras recorrentes que gera automaticamente transacoes provisorias ("fantasmas") no inicio de cada mes. Essas transacoes aparecem com aparencia distinta na lista e sao substituidas pelo valor real quando o usuario paga manualmente ou importa um extrato/fatura.

## Etapas de Implementacao

### Fase 1 - Schema do Banco de Dados

Criar tabela `recurring_rules` e adicionar campos na tabela `transactions`:

**Nova tabela: `recurring_rules`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `description` (text, NOT NULL) - ex: "Conta de Luz"
- `category_id` (uuid, nullable, FK categories)
- `account_id` (uuid, nullable) - se debito em conta
- `credit_card_id` (uuid, nullable) - se no cartao
- `estimated_amount` (numeric, NOT NULL, default 0)
- `type` (text, NOT NULL, default 'expense') - income ou expense
- `day_of_month` (integer, NOT NULL) - dia esperado do vencimento
- `active` (boolean, NOT NULL, default true)
- `created_at`, `updated_at` (timestamps)

RLS: mesmas politicas padrao do projeto (owner + shared_access para SELECT/UPDATE, owner-only para INSERT/DELETE).

**Alteracao na tabela `transactions`:**
- Adicionar `is_provisional` (boolean, NOT NULL, default false)
- Adicionar `recurring_rule_id` (uuid, nullable)

### Fase 2 - Hook useRecurringRules (CRUD)

Novo hook `src/hooks/useRecurringRules.ts`:
- Query para listar regras ativas do usuario
- Mutations para criar, editar, desativar e excluir regras
- Segue padrao existente dos outros hooks (useAccounts, useBudgets)

### Fase 3 - Hook useRecurringGenerator (Geracao Automatica)

Novo hook `src/hooks/useRecurringGenerator.ts`:
- Recebe `month` e `year` como parametros
- Ao ser chamado, consulta `recurring_rules` ativas
- Para cada regra, verifica se ja existe transacao com `recurring_rule_id` = regra.id no mes/ano
- Se nao existir, cria transacao com:
  - `status: 'pending'`
  - `is_provisional: true`
  - `recurring_rule_id: regra.id`
  - `amount: estimated_amount`
  - `date: year-month-day_of_month`
  - `due_date`: mesma data (para cartoes, respeita logica existente)
  - `description`: da regra
  - `category_id`, `account_id`, `credit_card_id`: da regra
- Usa `createTransaction` com flag `silent: true` para nao mostrar toast por cada uma
- Memoizado com useCallback para evitar loops

**Ponto de integracao:** Chamado dentro do `Dashboard.tsx` e `Transactions.tsx` via useEffect quando month/year muda.

### Fase 4 - Ajuste nos Calculos (Seguranca)

**useTransactions.ts:**
- `totalIncome`: excluir transacoes com `is_provisional: true`
- `totalExpense`: excluir transacoes com `is_provisional: true`
- Manter provisorias na lista de transacoes para exibicao

**useCreditCardInvoiceSync.ts:**
- Adicionar filtro `is_provisional = false` na query de recalculo do `current_invoice`
- Provisorias NAO afetam o saldo realizado

**useCreditCardReconciliation.ts:**
- Excluir provisorias do calculo de `transactionsTotal`
- Provisorias nao devem causar discrepancia na reconciliacao

**Dashboard.tsx:**
- Adicionar card ou subtexto "Saldo Projetado" nos SummaryCards
- Formula: Saldo Atual - (Provisorias pendentes de conta) 
- Fatura Projetada: current_invoice + (Provisorias de cartao)

### Fase 5 - Visualizacao na Lista de Transacoes

**Transactions.tsx - Aparencia "Ghost":**
- Transacoes com `is_provisional: true` recebem:
  - `opacity-60` no container
  - Icone de relogio (Clock) ao lado do valor
  - Badge "Previsto" com estilo distinto (ex: bg-amber-100 text-amber-700)
- Filtro adicional no TransactionFiltersModal: "Provisorio" (all / only_provisional / no_provisional)

### Fase 6 - Logica de Substituicao

**Cenario A - Pagamento Manual (TransactionModal):**
- Quando abrindo uma transacao com `is_provisional: true`, mostrar aviso visual: "Esta e uma previsao. Edite o valor real e salve para confirmar."
- Ao salvar: `is_provisional = false`, `status = 'completed'`, valor atualizado
- Botao adicional "Confirmar Pagamento" que faz o mesmo em um clique (mantendo valor estimado)

**Cenario B - Importacao com Match Inteligente:**

No `AccountReviewModal.tsx` e `InvoiceReviewModal.tsx`:
- Apos carregar itens importados, buscar transacoes provisorias do mesmo mes
- Algoritmo de matching:
  1. Mesma `category_id` E valor aproximado (margem 30%) = match forte
  2. Descricao similar (containsinsensitive parcial) E valor aproximado = match medio
  3. Apenas valor aproximado = match fraco (sugestao, nao auto-selecao)
- Se match encontrado, mostrar na linha: "Vincular a previsao: [Descricao] (R$ X)?" com checkbox
- Se checkbox marcado, ao confirmar importacao: UPDATE na transacao provisoria existente (amount, description, is_provisional=false, status=completed, imported_at) em vez de INSERT novo
- Reusa logica existente de `detectDuplicates` como referencia de pattern

### Fase 7 - Pagina de Gestao de Recorrencias

Nova pagina `src/pages/RecurringExpenses.tsx`:
- Lista de regras recorrentes com nome, categoria, valor estimado, dia, status (ativo/inativo)
- Modal para criar/editar regra (RecurringRuleModal)
- Toggle para ativar/desativar regra
- Botao de excluir com confirmacao
- Link na sidebar (AppSidebar.tsx) e bottom nav (BottomNav.tsx)

### Fase 8 - Atualizacao da Documentacao

Atualizar `AI_CONTEXT.md` com:
- Nova tabela `recurring_rules` no schema
- Novos campos `is_provisional` e `recurring_rule_id` na tabela transactions
- Hooks `useRecurringRules` e `useRecurringGenerator`
- Regras de negocio de provisorias (nao afetam saldos realizados)
- Fluxo de matching na importacao

---

## Secao Tecnica

### Migracao SQL

```text
-- Nova tabela
CREATE TABLE recurring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  description text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  credit_card_id uuid REFERENCES credit_cards(id) ON DELETE SET NULL,
  estimated_amount numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'expense',
  day_of_month integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies (padrao owner + shared_access)
CREATE POLICY "Users can view own or shared recurring_rules" ON recurring_rules
  FOR SELECT USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_with_user_id = auth.uid() AND owner_id = recurring_rules.user_id
    )
  );

CREATE POLICY "Users can insert own recurring_rules" ON recurring_rules
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own or shared recurring_rules" ON recurring_rules
  FOR UPDATE USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_with_user_id = auth.uid() AND owner_id = recurring_rules.user_id
    )
  );

CREATE POLICY "Users can delete own recurring_rules" ON recurring_rules
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE TRIGGER update_recurring_rules_updated_at 
  BEFORE UPDATE ON recurring_rules 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Novos campos em transactions
ALTER TABLE transactions ADD COLUMN is_provisional boolean NOT NULL DEFAULT false;
ALTER TABLE transactions ADD COLUMN recurring_rule_id uuid REFERENCES recurring_rules(id) ON DELETE SET NULL;
```

### Arquivos novos
- `src/hooks/useRecurringRules.ts` - CRUD de regras
- `src/hooks/useRecurringGenerator.ts` - geracao automatica
- `src/pages/RecurringExpenses.tsx` - pagina de gestao
- `src/components/modals/RecurringRuleModal.tsx` - modal de criar/editar regra

### Arquivos a alterar
- `src/hooks/useTransactions.ts` - excluir provisorias dos totais, adicionar campo na interface Transaction
- `src/hooks/useCreditCardInvoiceSync.ts` - filtrar provisorias do calculo
- `src/hooks/useCreditCardReconciliation.ts` - filtrar provisorias
- `src/pages/Dashboard.tsx` - adicionar saldo projetado
- `src/pages/Transactions.tsx` - estilo ghost, filtro provisorio
- `src/components/modals/TransactionModal.tsx` - modo "confirmar pagamento"
- `src/components/modals/AccountReviewModal.tsx` - matching com provisorias
- `src/components/modals/InvoiceReviewModal.tsx` - matching com provisorias
- `src/components/modals/TransactionFiltersModal.tsx` - filtro provisorio
- `src/components/layout/AppSidebar.tsx` - link para recorrencias
- `src/components/layout/BottomNav.tsx` - link para recorrencias
- `src/App.tsx` - rota /recurring
- `AI_CONTEXT.md` - documentacao

### Ordem de implementacao
1. Migracao SQL (tabela + campos)
2. Hook useRecurringRules + pagina + modal
3. Hook useRecurringGenerator + integracao Dashboard/Transactions
4. Estilo ghost na lista de transacoes
5. Logica de substituicao manual (TransactionModal)
6. Logica de matching na importacao (AccountReviewModal + InvoiceReviewModal)
7. Saldo projetado no Dashboard
8. Atualizacao da documentacao


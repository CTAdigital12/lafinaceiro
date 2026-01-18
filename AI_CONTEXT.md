# AI Context Document - Sistema de Gestão Financeira Pessoal

> **Propósito**: Este documento fornece contexto completo para IAs assistentes trabalharem neste projeto. Leia ANTES de qualquer modificação.

---

## 1. VISÃO GERAL DO PROJETO

| Item | Valor |
|------|-------|
| **Nome** | FinançasPro - Gestão Financeira Pessoal |
| **URL** | https://lafinaceiro.lovable.app |
| **Tipo** | Web App Mobile-First |
| **Frontend** | React 18 + Vite + TypeScript + Tailwind CSS |
| **Backend** | Supabase (Auth, PostgreSQL, Storage, Edge Functions) |
| **AI Integration** | Google Gemini 2.5 Pro (OCR de faturas) |
| **State** | TanStack React Query v5 |
| **UI Library** | Radix UI + shadcn/ui |

### Arquitetura
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React Frontend │────▶│  Supabase Cloud  │────▶│  Google Gemini  │
│  (Vite + TS)    │     │  (DB + Auth)     │     │  (OCR Faturas)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## 2. SCHEMA DO BANCO DE DADOS

### Tabela: `transactions` (PRINCIPAL)
```typescript
interface Transaction {
  id: string;                    // UUID
  user_id: string;               // FK auth.users
  account_id: string | null;     // FK accounts (null se cartão)
  credit_card_id: string | null; // FK credit_cards (null se conta)
  category_id: string | null;    // FK categories
  
  // DATAS - CRÍTICO!
  date: string;                  // Data da COMPRA (imutável)
  due_date: string | null;       // Data de VENCIMENTO/competência da fatura
  imported_at: string | null;    // Timestamp do upload
  
  // VALORES
  amount: number;                // Valor em R$ (positivo sempre)
  type: 'income' | 'expense';    // Tipo da transação
  description: string;           // Descrição
  status: 'completed' | 'pending';
  
  // FLAGS BOOLEANAS - MUITO IMPORTANTES!
  is_corporate_expense: boolean; // Gasto da empresa no cartão pessoal
  is_reimbursable: boolean;      // Despesa a ser reembolsada (diversas)
  is_card_payment: boolean;      // Pagamento de fatura (NÃO É DESPESA!)
  is_refund: boolean;            // Estorno/reembolso (despesa negativa)
  
  // PARCELAMENTOS
  installment_group_id: string | null;  // UUID agrupa parcelas
  installment_number: number | null;    // Parcela atual (ex: 3)
  total_installments: number | null;    // Total parcelas (ex: 10)
  
  // REEMBOLSO
  reimbursement_status: 'pending' | 'requested' | 'reimbursed' | null;
  refunded_transaction_id: string | null; // Transação original do estorno
}
```

### Tabela: `credit_cards`
```typescript
interface CreditCard {
  id: string;
  user_id: string;
  name: string;           // "Nubank", "Itaú"
  last_digits: string;    // "1234"
  brand: string;          // "mastercard", "visa"
  credit_limit: number;
  current_invoice: number; // Valor da fatura atual
  closing_date: number;    // Dia do fechamento (1-31)
  due_date: number;        // Dia do vencimento (1-31)
  status: 'open' | 'closed' | 'paid';
  color: string;           // Gradiente CSS
}
```

### Tabela: `accounts`
```typescript
interface Account {
  id: string;
  user_id: string;
  name: string;
  type: 'checking' | 'savings' | 'investment' | 'wallet';
  current_balance: number;
  icon: string;   // Emoji
  color: string;  // Gradiente CSS
}
```

### Tabela: `categories`
```typescript
interface Category {
  id: string;
  user_id: string;
  name: string;
  type: 'income' | 'expense';
  icon: string;      // Emoji
  color: string;     // Hex color
  parent_id: string | null; // HIERARQUIA! Subcategorias têm parent_id
}
```

### Tabela: `categorization_rules`
```typescript
interface CategorizationRule {
  id: string;
  user_id: string;
  keyword: string;       // Palavra-chave para matching (case insensitive)
  category_id: string;   // Categoria a aplicar
  is_corporate: boolean; // Também marca como corporativo?
}
```

### Tabela: `investment_assets`
```typescript
interface InvestmentAsset {
  id: string;
  user_id: string;
  institution_id: string | null;
  name: string;
  ticker: string;
  asset_type: 'renda_fixa' | 'renda_variavel' | 'fiis' | 'crypto' | 'saldo_corretora';
  quantity: number;
  average_price: number;  // Preço médio ponderado (calculado automaticamente)
  current_price: number;  // Cotação atual
  maturity_date: string | null; // Vencimento (renda fixa)
}
```

### Tabela: `investment_transactions`
```typescript
interface InvestmentTransaction {
  id: string;
  user_id: string;
  asset_id: string;
  type: 'buy' | 'sell' | 'dividend' | 'yield';
  quantity: number;
  unit_price: number;
  fees: number;
  total_value: number;
  date: string;
  realized_profit: number | null; // Lucro realizado (vendas)
  linked_transaction_id: string | null; // Transação financeira vinculada
}
```

### Tabela: `investment_institutions`
```typescript
interface InvestmentInstitution {
  id: string;
  user_id: string;
  name: string;   // "XP", "Rico", "NuInvest"
  icon: string;   // Emoji
  color: string;  // Hex
}
```

### Outras Tabelas
- `budgets`: Orçamentos mensais por categoria
- `profiles`: Dados do usuário (nome, email, avatar)
- `shared_access`: Compartilhamento de dados entre usuários
- `invitations`: Convites pendentes

---

## 3. REGRAS DE NEGÓCIO CRÍTICAS

### ⚠️ REGRA 1: Pagamento de Fatura NÃO É Despesa

```typescript
// CORRETO: Pagamento de fatura
{
  type: 'expense',
  is_card_payment: true,  // ← FLAG CRÍTICA
  account_id: 'conta-corrente',
  credit_card_id: 'cartao-id',
  // ...
}

// Ao filtrar despesas no Dashboard:
.filter(t => !t.is_card_payment) // SEMPRE excluir!
```

**Por quê?** Pagamento de fatura é transferência interna (conta → cartão), não gasto real.

---

### ⚠️ REGRA 2: date vs due_date

```typescript
// date = quando a compra FOI FEITA (imutável, histórico)
// due_date = em qual FATURA a compra aparece (competência)

// Exemplo: Compra em 28/Dez aparece na fatura de Janeiro
{
  date: '2024-12-28',      // Data real da compra
  due_date: '2025-01-10',  // Vencimento da fatura de Janeiro
}
```

**IMPORTANTE**: Dashboard de cartões filtra por `due_date`, não por `date`!

---

### ⚠️ REGRA 3: Lógica de Ano na Importação

Ao importar fatura de um mês, compras de meses anteriores são do ano passado:

```typescript
// Importando fatura de JANEIRO/2025
// Compra com data 28/DEZ → ano = 2024

if (purchaseMonth > invoiceMonth) {
  year = invoiceYear - 1;
}
```

---

### ⚠️ REGRA 4: Parcelamentos

```typescript
// Compra parcelada em 10x detectada como "3/10"
// Sistema cria parcelas 4-10 automaticamente

{
  installment_group_id: 'uuid-unico-da-compra', // MESMO para todas
  installment_number: 3,   // Esta é a 3ª
  total_installments: 10,  // De 10 parcelas
  due_date: '2025-01-10',  // Fatura de Janeiro
}

// Parcela 4:
{
  installment_group_id: 'uuid-unico-da-compra', // MESMO!
  installment_number: 4,
  due_date: '2025-02-10',  // +1 mês
}
```

---

### ⚠️ REGRA 5: Gastos Corporativos vs Reembolsáveis

| Flag | Significado | Aparece em relatórios pessoais? |
|------|-------------|--------------------------------|
| `is_corporate_expense` | Gasto da EMPRESA no cartão pessoal | ❌ Não |
| `is_reimbursable` | Gasto PESSOAL que será reembolsado | ❌ Não |
| Nenhum | Gasto pessoal normal | ✅ Sim |

---

### ⚠️ REGRA 6: Reembolsos/Estornos

```typescript
// Estorno aparece como valor negativo no cálculo
{
  type: 'expense',
  is_refund: true,
  amount: 150,  // Valor positivo no banco
  refunded_transaction_id: 'transacao-original-id',
}

// Cálculo no Dashboard:
totalExpense = despesasNormais - estornos
```

---

### ⚠️ REGRA 7: Categorias Hierárquicas

```typescript
// Categoria pai
{ id: '1', name: 'Alimentação', parent_id: null }

// Subcategorias
{ id: '2', name: 'Restaurantes', parent_id: '1' }
{ id: '3', name: 'Supermercado', parent_id: '1' }

// Transações podem ter categoria pai OU subcategoria
```

---

## 4. PADRÕES DE CÓDIGO

### React Query Hooks

Todos os hooks estão em `src/hooks/`:

```typescript
// Importação
import { useTransactions } from '@/hooks/useTransactions';
import { useCreditCards } from '@/hooks/useCreditCards';
import { useCategories } from '@/hooks/useCategories';

// Uso
const { transactions, isLoading, createTransaction, updateTransaction } = useTransactions();
const { creditCards, createCreditCard } = useCreditCards();
```

### Queries Supabase

```typescript
import { supabase } from '@/integrations/supabase/client';

// SELECT
const { data, error } = await supabase
  .from('transactions')
  .select('*, categories(*), accounts(*)')
  .eq('user_id', userId)
  .order('date', { ascending: false });

// INSERT
const { error } = await supabase
  .from('transactions')
  .insert([{ ...transaction, user_id: userId }]);

// UPDATE
const { error } = await supabase
  .from('transactions')
  .update({ category_id: newCategoryId })
  .eq('id', transactionId);
```

### Estrutura de Componentes

```
src/components/
├── layout/          # AppSidebar, Header, MainLayout
├── modals/          # TransactionModal, InvoiceReviewModal, etc
├── dashboard/       # SummaryCard, CategoryChart, etc
├── investments/     # AssetTable, AllocationChart, etc
├── credit-cards/    # InstallmentsDashboard, ReconciliationCard
├── ui/              # shadcn/ui (Button, Card, Dialog, etc)
```

### Modais vs Sheets

```typescript
// Mobile: usar Sheet (drawer lateral)
<Sheet>
  <SheetTrigger asChild>...</SheetTrigger>
  <SheetContent>...</SheetContent>
</Sheet>

// Desktop: pode usar Dialog
<Dialog>
  <DialogTrigger asChild>...</DialogTrigger>
  <DialogContent>...</DialogContent>
</Dialog>
```

---

## 5. EDGE FUNCTIONS

### `parse-invoice` (OCR de Faturas)

**Localização**: `supabase/functions/parse-invoice/index.ts`

**Fluxo**:
1. Recebe PDF da fatura (multipart/form-data)
2. Converte para base64
3. Envia ao Google Gemini 2.5 Pro com prompt estruturado
4. Gemini extrai: data, descrição, valor, parcelas
5. Retorna JSON com items extraídos

**Prompt instrui**:
- Ignorar tabela "próximas faturas"
- Detectar parcelamentos (regex: `\d+/\d+`)
- Extrair total do cabeçalho para validação

### `migrate-installments`

**Localização**: `supabase/functions/migrate-installments/index.ts`

**Propósito**: Migrar parcelamentos legados para novo schema com `installment_group_id`

---

## 6. FLUXOS IMPLEMENTADOS

### Fluxo: Importação de Fatura PDF

```
1. Upload do arquivo
   └─▶ InvoiceImportModal.tsx

2. Envio para Edge Function
   └─▶ parse-invoice (Gemini OCR)

3. Retorno dos items extraídos
   └─▶ InvoiceReviewModal.tsx (Staging Area)

4. Usuário revisa cada item:
   ├─ Edita descrição
   ├─ Seleciona categoria (pode criar nova)
   ├─ Marca corporativo/reembolsável
   ├─ Checkbox "Lembrar Regra"
   └─ Checkbox "Adicionar Parcelas Futuras"

5. Confirma importação
   └─▶ Cria transações + regras de categorização
```

### Fluxo: Pagamento de Fatura

```
1. Usuário abre PayInvoiceModal
   └─ Seleciona cartão, conta, valor

2. Sistema cria transação:
   {
     type: 'expense',
     is_card_payment: true,
     account_id: contaSelecionada,
     credit_card_id: cartaoId,
   }

3. Atualiza saldos:
   ├─ account.current_balance -= valor
   ├─ credit_card.current_invoice -= valor
   └─ credit_card.status = 'paid' (se zerou)
```

### Fluxo: Registro de Investimento

```
1. Usuário abre OperationModal
   └─ Seleciona ativo, tipo, quantidade, preço

2. Se COMPRA:
   ├─ Calcula novo preço médio ponderado
   ├─ Atualiza quantity do ativo
   └─ Opcionalmente cria transação de despesa

3. Se VENDA:
   ├─ Calcula lucro realizado
   ├─ Reduz quantity
   └─ Opcionalmente cria transação de receita
```

---

## 7. ARMADILHAS A EVITAR

### ❌ Não esquecer de excluir `is_card_payment` dos relatórios
```typescript
// ERRADO
const despesas = transactions.filter(t => t.type === 'expense');

// CORRETO
const despesas = transactions.filter(t => 
  t.type === 'expense' && 
  !t.is_card_payment && 
  !t.is_refund
);
```

### ❌ Não confundir `date` com `due_date`
```typescript
// Filtro para Dashboard de cartão de crédito:
// USAR due_date, não date!
.gte('due_date', startOfMonth)
.lte('due_date', endOfMonth)
```

### ❌ Não ignorar hierarquia de categorias
```typescript
// Ao exibir gastos por categoria, agrupar subcategorias:
const parentCategories = categories.filter(c => !c.parent_id);
const subcategories = categories.filter(c => c.parent_id === parentId);
```

### ❌ Não esquecer RLS
```typescript
// Todas as queries já filtram por user_id via RLS
// Mas ao inserir, SEMPRE incluir user_id:
.insert([{ ...data, user_id: user.id }])
```

### ❌ Cuidado com o limite de 1000 rows do Supabase
```typescript
// Se precisar mais de 1000 registros:
.range(0, 999)  // Primeira página
.range(1000, 1999)  // Segunda página
```

---

## 8. CONVENÇÕES

### Datas
```typescript
// Formato no banco: YYYY-MM-DD
date: '2025-01-15'

// Formato para exibição: date-fns
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
format(new Date(date), 'dd/MM/yyyy', { locale: ptBR })
```

### Valores Monetários
```typescript
// Sempre armazenar como número (NUMERIC no Postgres)
amount: 150.99

// Formatar para exibição:
new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(amount)
// → "R$ 150,99"
```

### Cores
```typescript
// Categorias: Hex
color: '#3B82F6'

// Cards/Accounts: Gradiente Tailwind
color: 'from-purple-500 to-purple-600'
```

### Ícones
```typescript
// Categorias: Emoji
icon: '🍔'

// Componentes: Lucide React
import { CreditCard, Wallet } from 'lucide-react';
```

---

## 9. ARQUIVOS IMPORTANTES

| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useTransactions.ts` | CRUD de transações |
| `src/hooks/useCreditCards.ts` | CRUD de cartões |
| `src/hooks/useCategories.ts` | CRUD de categorias |
| `src/hooks/useInvestments.ts` | CRUD de investimentos |
| `src/components/modals/InvoiceReviewModal.tsx` | Staging de importação |
| `src/pages/Dashboard.tsx` | Tela principal |
| `supabase/functions/parse-invoice/index.ts` | OCR de faturas |
| `src/integrations/supabase/types.ts` | Types do banco (AUTO-GERADO) |

---

## 10. CHECKLIST ANTES DE MODIFICAR

- [ ] Li este documento completamente
- [ ] Entendi a diferença entre `date` e `due_date`
- [ ] Entendi as flags booleanas (`is_card_payment`, `is_corporate_expense`, etc)
- [ ] Sei que pagamento de fatura NÃO é despesa
- [ ] Sei que categorias têm hierarquia (parent_id)
- [ ] Vou usar os hooks existentes (`useTransactions`, etc)
- [ ] Vou manter os filtros de RLS (user_id)
- [ ] Vou testar em mobile (app é mobile-first)

---

**Última atualização**: Janeiro 2025

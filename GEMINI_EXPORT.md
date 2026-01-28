# LA Financeiro - Documentação Técnica Completa

> **Última Atualização:** Janeiro 2026  
> **Versão:** 2.0  
> **URL de Produção:** https://lafinaceiro.lovable.app

Este documento consolida toda a documentação técnica do sistema LA Financeiro, projetado para ser usado como contexto em IAs externas (Gemini, GPT, Claude).

---

## 📋 Índice

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Schema do Banco de Dados](#2-schema-do-banco-de-dados)
3. [Regras de Negócio Críticas](#3-regras-de-negócio-críticas)
4. [Fórmulas de Cálculo](#4-fórmulas-de-cálculo)
5. [Estrutura de Arquivos](#5-estrutura-de-arquivos)
6. [Padrões de Segurança](#6-padrões-de-segurança)
7. [Fluxos de Importação](#7-fluxos-de-importação)
8. [Hooks e Suas Responsabilidades](#8-hooks-e-suas-responsabilidades)
9. [Componentes Principais](#9-componentes-principais)
10. [Edge Functions](#10-edge-functions)
11. [Troubleshooting](#11-troubleshooting)
12. [Memórias Arquiteturais](#12-memórias-arquiteturais)
13. [Fluxos de UI e Interações](#13-fluxos-de-ui-e-interações-do-usuário)

---

## 1. Visão Geral do Sistema

### Stack Tecnológico

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | React 18 + TypeScript |
| **Build** | Vite |
| **Estilização** | Tailwind CSS + shadcn/ui |
| **Estado** | TanStack React Query v5 |
| **Roteamento** | React Router v6 |
| **Backend** | Supabase (Lovable Cloud) |
| **Banco de Dados** | PostgreSQL (via Supabase) |
| **Autenticação** | Supabase Auth |
| **OCR/IA** | Google Gemini 2.5 Pro |
| **Gráficos** | Recharts |

### Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Pages     │  │ Components  │  │      Hooks          │  │
│  │ (17 rotas)  │  │ (50+ comp.) │  │ (19 React Query)    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          ▼                                   │
│              ┌───────────────────────┐                       │
│              │   Supabase Client     │                       │
│              │ (src/integrations/)   │                       │
│              └───────────┬───────────┘                       │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     LOVABLE CLOUD                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  PostgreSQL │  │    Auth     │  │   Edge Functions    │  │
│  │ (12 tables) │  │  (Supabase) │  │   (parse-invoice)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │               Row Level Security (RLS)                  ││
│  │    Todas as tabelas protegidas por user_id + shared     ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Schema do Banco de Dados

### 2.1 Tabela: `transactions` (Principal)

A tabela mais importante do sistema. Armazena todas as movimentações financeiras.

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador único |
| `user_id` | uuid | No | - | Dono da transação |
| `account_id` | uuid | Yes | null | Conta bancária (se não for cartão) |
| `credit_card_id` | uuid | Yes | null | Cartão de crédito (se aplicável) |
| `category_id` | uuid | Yes | null | Categoria da transação |
| `description` | text | No | - | Descrição do lançamento |
| `amount` | numeric | No | - | Valor da transação |
| `type` | text | No | - | `"income"` ou `"expense"` |
| `date` | date | No | CURRENT_DATE | **Data da compra** (imutável) |
| `due_date` | date | Yes | null | **Competência da fatura** (calculada) |
| `status` | text | No | 'completed' | `"completed"` ou `"pending"` |
| `is_corporate_expense` | boolean | No | false | Gasto corporativo |
| `is_refund` | boolean | No | false | Estorno/reembolso |
| `is_reimbursable` | boolean | No | false | Gasto reembolsável |
| `is_card_payment` | boolean | Yes | false | **Pagamento de fatura** |
| `reimbursement_status` | text | Yes | 'pending' | `"pending"`, `"requested"`, `"reimbursed"` |
| `installment_group_id` | uuid | Yes | null | Agrupa parcelas |
| `installment_number` | integer | Yes | null | Número da parcela (ex: 3) |
| `total_installments` | integer | Yes | null | Total de parcelas (ex: 10) |
| `refunded_transaction_id` | uuid | Yes | null | Transação original estornada |
| `imported_at` | timestamp | Yes | null | Data de importação |
| `created_at` | timestamp | No | now() | Criação do registro |
| `updated_at` | timestamp | No | now() | Última atualização |

#### Campos Críticos - Explicação Detalhada

**`date` vs `due_date`:**
- `date`: Data em que a compra foi realizada. **NUNCA deve ser alterada** após a criação.
- `due_date`: Competência da fatura (mês em que a despesa será cobrada). Calculada automaticamente com base na `closing_date` do cartão.

**`is_card_payment`:**
- Quando `true`, a transação representa uma **transferência bancária para pagar a fatura**.
- **NÃO é uma despesa real** - é apenas um movimento de caixa.
- Deve ser **excluída dos totais de despesas** do Dashboard/Transações.
- Deve ser **subtraída do saldo da fatura** (`current_invoice`).

**`is_refund`:**
- Quando `true`, o valor deve ser **subtraído** do total de despesas.
- Fórmula: `totalExpense = normalExpenses - refundExpenses`

---

### 2.2 Tabela: `credit_cards`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador |
| `user_id` | uuid | No | - | Dono do cartão |
| `name` | text | No | - | Nome do cartão |
| `last_digits` | text | No | - | Últimos 4 dígitos |
| `brand` | text | No | - | Bandeira (Visa, Mastercard) |
| `credit_limit` | numeric | No | 0 | Limite de crédito |
| `current_invoice` | numeric | No | 0 | **Saldo atual da fatura** |
| `due_date` | integer | No | 10 | Dia de vencimento (1-31) |
| `closing_date` | integer | No | 3 | Dia de fechamento (1-31) |
| `color` | text | Yes | gradient | Cor do card (CSS gradient) |
| `status` | text | No | 'open' | `"open"`, `"paid"`, `"closed"` |

#### Campo `current_invoice` - Sincronização Automática

O saldo é recalculado automaticamente via `useCreditCardInvoiceSync.ts`:

```typescript
// Fórmula de cálculo:
current_invoice = 
  Σ(completed expenses) 
  - Σ(refunds where is_refund=true) 
  - Σ(payments where is_card_payment=true)
```

---

### 2.3 Tabela: `accounts`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador |
| `user_id` | uuid | No | - | Dono da conta |
| `name` | text | No | - | Nome da conta |
| `type` | text | No | - | `"bank"`, `"wallet"`, `"investment"` |
| `current_balance` | numeric | No | 0 | Saldo atual |
| `icon` | text | Yes | '🏦' | Emoji do ícone |
| `color` | text | Yes | gradient | Cor (CSS gradient) |

---

### 2.4 Tabela: `categories`

Suporta **hierarquia** (categorias pai/filho).

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador |
| `user_id` | uuid | No | - | Dono da categoria |
| `name` | text | No | - | Nome da categoria |
| `parent_id` | uuid | Yes | null | Categoria pai (para subcategorias) |
| `type` | text | No | - | `"income"` ou `"expense"` |
| `icon` | text | Yes | '📦' | Emoji |
| `color` | text | Yes | '#3B82F6' | Cor hexadecimal |

---

### 2.5 Tabela: `budgets`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador |
| `user_id` | uuid | No | - | Dono do orçamento |
| `category_id` | uuid | Yes | null | Categoria vinculada |
| `planned_amount` | numeric | No | 0 | Valor planejado |
| `month` | integer | No | - | Mês (1-12) |
| `year` | integer | No | - | Ano |

---

### 2.6 Tabela: `categorization_rules`

Regras automáticas para categorizar transações importadas.

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador |
| `user_id` | uuid | No | - | Dono da regra |
| `keyword` | text | No | - | Palavra-chave (case insensitive) |
| `category_id` | uuid | Yes | null | Categoria a aplicar |
| `is_corporate` | boolean | No | false | Marcar como corporativo |

---

### 2.7 Tabela: `investment_institutions`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador |
| `user_id` | uuid | No | - | Dono |
| `name` | text | No | - | Nome da instituição |
| `icon` | text | Yes | '🏦' | Emoji |
| `color` | text | Yes | '#3B82F6' | Cor |

---

### 2.8 Tabela: `investment_assets`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador |
| `user_id` | uuid | No | - | Dono |
| `institution_id` | uuid | Yes | null | Instituição vinculada |
| `name` | text | No | - | Nome do ativo |
| `ticker` | text | No | - | Código/Ticker |
| `asset_type` | text | No | - | Tipo (ação, FII, RF, etc.) |
| `quantity` | numeric | No | 0 | Quantidade |
| `average_price` | numeric | No | 0 | Preço médio |
| `current_price` | numeric | No | 0 | Preço atual |
| `current_balance` | numeric | Yes | 0 | Saldo atual (para RF) |
| `pricing_method` | text | Yes | 'unit_price' | Método de precificação |
| `maturity_date` | date | Yes | null | Vencimento (RF) |
| `yield_info` | text | Yes | null | Info de rendimento |
| `liquidity` | text | Yes | null | Liquidez |

---

### 2.9 Tabela: `investment_transactions`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador |
| `user_id` | uuid | No | - | Dono |
| `asset_id` | uuid | Yes | null | Ativo vinculado |
| `type` | text | No | - | `"buy"`, `"sell"`, `"dividend"`, etc. |
| `quantity` | numeric | No | 0 | Quantidade |
| `unit_price` | numeric | No | 0 | Preço unitário |
| `fees` | numeric | No | 0 | Taxas |
| `total_value` | numeric | No | 0 | Valor total |
| `date` | date | No | CURRENT_DATE | Data da operação |
| `realized_profit` | numeric | Yes | null | Lucro realizado (vendas) |
| `linked_transaction_id` | uuid | Yes | null | Transação financeira vinculada |
| `notes` | text | Yes | null | Observações |

---

### 2.10 Tabela: `profiles`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | - | ID do usuário (auth.users) |
| `email` | text | Yes | null | Email |
| `full_name` | text | Yes | null | Nome completo |
| `avatar_url` | text | Yes | null | URL do avatar |

---

### 2.11 Tabela: `invitations`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador |
| `owner_id` | uuid | No | - | Quem convidou |
| `invited_email` | text | No | - | Email do convidado |
| `invited_user_id` | uuid | Yes | null | ID após aceitar |
| `status` | text | No | 'pending' | `"pending"`, `"accepted"` |
| `accepted_at` | timestamp | Yes | null | Data de aceite |

---

### 2.12 Tabela: `shared_access`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | uuid | No | gen_random_uuid() | Identificador |
| `owner_id` | uuid | No | - | Dono dos dados |
| `shared_with_user_id` | uuid | No | - | Usuário com acesso |

---

### Diagrama de Relacionamentos

```
┌─────────────────┐
│     profiles    │
│   (id = user)   │
└────────┬────────┘
         │
         │ user_id
         ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   transactions  │◄────►│   credit_cards  │      │    accounts     │
│                 │      │                 │      │                 │
│ credit_card_id  │      │                 │      │                 │
│ account_id      │      │                 │      │                 │
│ category_id     │      │                 │      │                 │
└────────┬────────┘      └─────────────────┘      └─────────────────┘
         │
         │ category_id
         ▼
┌─────────────────┐      ┌─────────────────┐
│   categories    │◄────►│     budgets     │
│                 │      │                 │
│ parent_id (self)│      │ category_id     │
└─────────────────┘      └─────────────────┘

┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ inv_institutions│◄────►│ inv_assets      │◄────►│ inv_transactions│
│                 │      │ institution_id  │      │ asset_id        │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## 3. Regras de Negócio Críticas

### 3.1 `date` vs `due_date`

| Campo | Significado | Quando Usar |
|-------|-------------|-------------|
| `date` | Data da compra (imutável) | Histórico, relatórios de compras |
| `due_date` | Competência da fatura | Filtros de fatura, reconciliação, Dashboard |

**Regra de cálculo do `due_date`:**
```typescript
// Se a data da compra é ANTERIOR ao fechamento do cartão,
// a fatura é do mesmo mês
// Senão, a fatura é do mês seguinte

if (purchaseDay <= closingDate) {
  due_date = `${year}-${month}-${dueDate}`
} else {
  due_date = `${year}-${month + 1}-${dueDate}`
}
```

**Inferência de Ano (para importação de PDF):**
```typescript
// Se o mês da compra > mês da fatura, a compra foi no ano anterior
if (purchaseMonth > invoiceMonth) {
  year = invoiceYear - 1
}
```

---

### 3.2 Pagamento de Fatura (`is_card_payment`)

- **O que é:** Transferência bancária de uma conta para o cartão de crédito.
- **NÃO é despesa:** Deve ser **excluído** dos totais de despesas.
- **Afeta o saldo:** Reduz o `current_invoice` do cartão.
- **Obrigatório:** `credit_card_id` deve estar preenchido.

```typescript
// Filtro para excluir pagamentos de fatura dos totais
const realExpenses = transactions.filter(t => 
  t.type === "expense" && 
  !t.is_card_payment && 
  !t.is_refund
);
```

---

### 3.3 Estornos (`is_refund`)

- **O que é:** Devolução de valor (crédito na fatura).
- **Subtrai do total:** `totalExpense = normalExpenses - expenseRefunds`
- **Aparece como:** Despesa com valor negativo visualmente, mas amount é positivo.

```typescript
// Cálculo correto de despesas
const normalExpenses = transactions
  .filter(t => t.type === "expense" && !t.is_refund && !t.is_card_payment)
  .reduce((sum, t) => sum + t.amount, 0);

const expenseRefunds = transactions
  .filter(t => t.type === "expense" && t.is_refund)
  .reduce((sum, t) => sum + t.amount, 0);

const totalExpense = normalExpenses - expenseRefunds;
```

---

### 3.4 Gastos Corporativos (`is_corporate_expense`)

- **O que é:** Despesas feitas em nome da empresa.
- **Isolado:** Não aparece nos relatórios pessoais do Dashboard.
- **Reconciliação:** Tem seção separada no pagamento de fatura.

---

### 3.5 Gastos Reembolsáveis (`is_reimbursable`)

- **O que é:** Gastos pessoais que serão reembolsados.
- **Status:** `reimbursement_status` = `"pending"` | `"requested"` | `"reimbursed"`
- **Fluxo:** Pendente → Solicitado → Reembolsado

---

### 3.6 Parcelamentos

Transações parceladas são agrupadas por `installment_group_id`.

| Campo | Descrição |
|-------|-----------|
| `installment_group_id` | UUID que agrupa todas as parcelas |
| `installment_number` | Número da parcela (1, 2, 3...) |
| `total_installments` | Total de parcelas (ex: 10) |

**Regras:**
- Ao editar categoria de uma parcela, TODAS as parcelas do grupo são atualizadas.
- Parcelas pendentes podem ser removidas em lote.
- Novas parcelas podem ser adicionadas ao grupo.

---

### 3.7 Sincronização Automática de `current_invoice`

O hook `useCreditCardInvoiceSync` recalcula o saldo após:
- Criar transação de cartão
- Editar transação de cartão
- Excluir transação de cartão

```typescript
// Fórmula implementada em useCreditCardInvoiceSync.ts
let invoiceTotal = 0;

for (const tx of transactions) {
  if (tx.status !== "completed") continue;
  
  if (tx.is_card_payment) {
    invoiceTotal -= tx.amount; // Pagamentos reduzem
  } else if (tx.type === "expense") {
    if (tx.is_refund) {
      invoiceTotal -= tx.amount; // Estornos reduzem
    } else {
      invoiceTotal += tx.amount; // Despesas aumentam
    }
  }
}

invoiceTotal = Math.max(0, invoiceTotal); // Nunca negativo
```

---

### 3.8 Preservação de `due_date`

Ao editar uma transação existente:
- Se apenas categoria/descrição mudar: **mantém** o `due_date` original
- Se a data da compra mudar: **recalcula** o `due_date`
- Se o cartão mudar: **recalcula** o `due_date`

---

## 4. Fórmulas de Cálculo

### 4.1 Total de Despesas (Dashboard/Transações)

```typescript
// Despesas normais (excluindo estornos e pagamentos de fatura)
const normalExpenses = transactions
  .filter(t => 
    t.type === "expense" && 
    !t.is_refund && 
    !t.is_card_payment && 
    !t.is_corporate_expense && 
    !t.is_reimbursable
  )
  .reduce((sum, t) => sum + Number(t.amount), 0);

// Estornos de despesa (a subtrair)
const expenseRefunds = transactions
  .filter(t => 
    t.type === "expense" && 
    t.is_refund && 
    !t.is_corporate_expense && 
    !t.is_reimbursable
  )
  .reduce((sum, t) => sum + Number(t.amount), 0);

// Total líquido
const totalExpense = normalExpenses - expenseRefunds;
```

---

### 4.2 Total de Receitas

```typescript
// Apenas receitas reais (não estornos de despesa)
const totalIncome = transactions
  .filter(t => t.type === "income" && !t.is_refund)
  .reduce((sum, t) => sum + Number(t.amount), 0);
```

---

### 4.3 Saldo da Fatura do Cartão

```typescript
// current_invoice = despesas - estornos - pagamentos
let current_invoice = 0;

for (const tx of cardTransactions) {
  if (tx.status !== "completed") continue;
  
  if (tx.is_card_payment) {
    current_invoice -= tx.amount;
  } else if (tx.type === "expense") {
    current_invoice += tx.is_refund ? -tx.amount : tx.amount;
  }
}

current_invoice = Math.max(0, current_invoice);
```

---

### 4.4 Reconciliação de Fatura

```typescript
// Total de lançamentos (para comparar com o banco)
const normalTotal = transactions
  .filter(t => !t.is_refund && !t.is_card_payment)
  .reduce((sum, t) => sum + t.amount, 0);

const refundTotal = transactions
  .filter(t => t.is_refund)
  .reduce((sum, t) => sum + t.amount, 0);

const transactionsTotal = normalTotal - refundTotal;

// Discrepância = Saldo do Banco - Total de Lançamentos
const discrepancy = current_invoice - transactionsTotal;

// Se discrepancy > 0: faltam lançamentos
// Se discrepancy < 0: sobraram lançamentos (ou pagamentos a mais)
```

---

### 4.5 Filtro Híbrido (Dashboard)

O Dashboard usa filtro diferente para contas e cartões:
- **Contas bancárias:** Filtra por `date` (data da transação)
- **Cartões de crédito:** Filtra por `due_date` (competência da fatura)

```typescript
// Filtro híbrido implementado em useTransactions.ts
query = query.or(
  `and(credit_card_id.is.null,date.gte.${startDate},date.lte.${endDate}),` +
  `and(credit_card_id.not.is.null,due_date.gte.${startDate},due_date.lte.${endDate})`
);
```

---

## 5. Estrutura de Arquivos

```
src/
├── App.tsx                        # Rotas principais
├── main.tsx                       # Entry point
├── index.css                      # Estilos globais + tokens
│
├── contexts/
│   ├── AuthContext.tsx            # Autenticação
│   └── DateContext.tsx            # Mês/Ano selecionado
│
├── hooks/
│   ├── useTransactions.ts         # CRUD transações (290 linhas)
│   ├── useCreditCards.ts          # CRUD cartões
│   ├── useCreditCardInvoiceSync.ts# Sync automático de saldo
│   ├── useCreditCardReconciliation.ts # Lógica de conciliação
│   ├── useCreditCardTransactions.ts   # Transações de cartão
│   ├── useCategories.ts           # CRUD categorias
│   ├── useAccounts.ts             # CRUD contas
│   ├── useBudgets.ts              # CRUD orçamentos
│   ├── useCategorizationRules.ts  # Regras automáticas
│   ├── useInstallmentGroup.ts     # Gestão de parcelas
│   ├── usePendingInstallments.ts  # Parcelas pendentes
│   ├── useInstitutions.ts         # Instituições de investimento
│   ├── useInvestments.ts          # Ativos e operações
│   ├── useInvitations.ts          # Convites de acesso
│   ├── useInvoiceTransactions.ts  # Transações da fatura
│   ├── useBankPaymentCandidates.ts# Candidatos para vincular
│   ├── useActivities.ts           # Log de atividades
│   └── use-mobile.tsx             # Detecção de mobile
│
├── pages/
│   ├── Dashboard.tsx              # Resumo financeiro
│   ├── Transactions.tsx           # Lista com 3 abas
│   ├── CreditCards.tsx            # Gestão de cartões
│   ├── Accounts.tsx               # Gestão de contas
│   ├── Categories.tsx             # Gestão de categorias
│   ├── CategorizationRules.tsx    # Regras automáticas
│   ├── Planning.tsx               # Orçamentos
│   ├── Investments.tsx            # Carteira de investimentos
│   ├── Reports.tsx                # Relatórios
│   ├── CorporateExpenses.tsx      # Gastos corporativos
│   ├── Reimbursements.tsx         # Reembolsos
│   ├── Activities.tsx             # Log de atividades
│   ├── Settings.tsx               # Configurações
│   ├── Auth.tsx                   # Login/Signup
│   ├── ForgotPassword.tsx         # Recuperação de senha
│   ├── ResetPassword.tsx          # Reset de senha
│   └── NotFound.tsx               # 404
│
├── components/
│   ├── ui/                        # shadcn/ui components (50+)
│   │
│   ├── layout/
│   │   ├── MainLayout.tsx         # Layout principal
│   │   ├── AppSidebar.tsx         # Menu lateral (desktop)
│   │   ├── BottomNav.tsx          # Navegação (mobile)
│   │   └── Header.tsx             # Cabeçalho
│   │
│   ├── dashboard/
│   │   ├── SummaryCard.tsx        # Cards de resumo
│   │   ├── BalanceChart.tsx       # Gráfico de saldo
│   │   ├── CategoryChart.tsx      # Gráfico por categoria
│   │   ├── BudgetEvolutionChart.tsx # Evolução do orçamento
│   │   ├── AllCategoriesList.tsx  # Lista de categorias
│   │   ├── CategoryDetailSheet.tsx # Detalhes da categoria
│   │   └── ParentCategoryDetailSheet.tsx # Detalhes da categoria pai
│   │
│   ├── credit-cards/
│   │   ├── InstallmentsDashboard.tsx    # Dashboard de parcelas
│   │   ├── InvoiceBreakdownCard.tsx     # Breakdown da fatura
│   │   ├── ReconciliationCard.tsx       # Card de reconciliação
│   │   ├── ReconciliationDetailModal.tsx # Modal de detalhes
│   │   └── InvoiceDiscrepancyReport.tsx # Relatório de discrepância
│   │
│   ├── investments/
│   │   ├── AllocationChart.tsx    # Gráfico de alocação
│   │   ├── AssetTable.tsx         # Tabela de ativos
│   │   ├── AssetModal.tsx         # Modal de ativo
│   │   ├── InstitutionsList.tsx   # Lista de instituições
│   │   ├── InstitutionModal.tsx   # Modal de instituição
│   │   ├── TransactionHistory.tsx # Histórico de operações
│   │   ├── OperationModal.tsx     # Modal de operação
│   │   ├── UpdatePricesModal.tsx  # Atualizar preços
│   │   └── InvestmentSummaryCards.tsx # Cards de resumo
│   │
│   ├── modals/
│   │   ├── TransactionModal.tsx   # Criar/Editar transação
│   │   ├── TransactionFiltersModal.tsx # Filtros
│   │   ├── AccountModal.tsx       # Criar/Editar conta
│   │   ├── AccountImportModal.tsx # Importar extrato
│   │   ├── AccountReviewModal.tsx # Revisar importação
│   │   ├── CreditCardModal.tsx    # Criar/Editar cartão
│   │   ├── InvoiceImportModal.tsx # Importar fatura PDF
│   │   ├── InvoiceReviewModal.tsx # Revisar importação
│   │   ├── InvoiceItemsModal.tsx  # Itens da fatura
│   │   ├── PayInvoiceModal.tsx    # Pagar fatura
│   │   ├── AddInstallmentsModal.tsx  # Adicionar parcelas
│   │   ├── EditInstallmentsModal.tsx # Editar parcelas
│   │   ├── NewBudgetModal.tsx     # Novo orçamento
│   │   ├── EditBudgetModal.tsx    # Editar orçamento
│   │   ├── AddSubcategoryModal.tsx # Nova subcategoria
│   │   └── DeleteCategoryModal.tsx # Excluir categoria
│   │
│   ├── reports/
│   │   └── RefundReport.tsx       # Relatório de estornos
│   │
│   ├── settings/
│   │   ├── MembersSection.tsx     # Gerenciar membros
│   │   └── InstallmentMigration.tsx # Migrar parcelas
│   │
│   ├── CategorySelector.tsx       # Seletor de categoria
│   └── InstallmentDetailsSheet.tsx # Detalhes de parcelas
│
├── integrations/supabase/
│   ├── client.ts                  # Cliente Supabase (AUTO-GERADO)
│   └── types.ts                   # Tipos do DB (AUTO-GERADO)
│
├── lib/
│   ├── utils.ts                   # Utilitários (cn, formatCurrency)
│   ├── constants.ts               # Constantes do domínio
│   ├── errorHandler.ts            # Tratamento de erros
│   ├── csvParser.ts               # Parser de CSV bancário
│   ├── csvInvoiceParser.ts        # Parser de CSV de fatura
│   ├── ofxParser.ts               # Parser de OFX
│   └── bankConfig.ts              # Configurações por banco
│
├── types/
│   └── index.ts                   # Tipos centralizados
│
└── config/
    └── version.ts                 # Versão do app
```

---

## 6. Padrões de Segurança

### 6.1 Verificação de Autenticação

**OBRIGATÓRIO** em todas as mutations de INSERT:

```typescript
const createSomething = useMutation({
  mutationFn: async (data) => {
    // SEMPRE verificar antes de INSERT
    if (!user?.id) {
      throw new Error("Usuário não autenticado");
    }
    
    const { error } = await supabase
      .from("table")
      .insert([{ ...data, user_id: user.id }]);
    
    if (error) throw error;
  },
  onError: (error: Error) => {
    toast({ 
      title: "Erro", 
      description: error.message, 
      variant: "destructive" 
    });
  },
});
```

---

### 6.2 Row Level Security (RLS)

Todas as tabelas têm RLS habilitado com políticas:

```sql
-- Visualizar próprios dados OU dados compartilhados
CREATE POLICY "Users can view own or shared data" ON table_name
FOR SELECT USING (
  auth.uid() = user_id 
  OR EXISTS (
    SELECT 1 FROM shared_access 
    WHERE shared_with_user_id = auth.uid() 
    AND owner_id = table_name.user_id
  )
);

-- Inserir apenas próprios dados
CREATE POLICY "Users can insert own data" ON table_name
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Atualizar apenas próprios dados
CREATE POLICY "Users can update own data" ON table_name
FOR UPDATE USING (auth.uid() = user_id);

-- Excluir apenas próprios dados
CREATE POLICY "Users can delete own data" ON table_name
FOR DELETE USING (auth.uid() = user_id);
```

---

### 6.3 Tratamento de Erros

Usar o utilitário centralizado:

```typescript
import { logError, getSafeErrorMessage } from "@/lib/errorHandler";

// Em catch blocks
catch (error) {
  logError(error as Error, "NomeDaFuncao");
  toast({
    title: "Erro",
    description: getSafeErrorMessage(error),
    variant: "destructive",
  });
}
```

---

## 7. Fluxos de Importação

### 7.1 Importação de Fatura PDF

```
┌─────────────────┐
│  Upload PDF     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Edge Function  │
│ (parse-invoice) │
│                 │
│ • Base64 encode │
│ • Gemini OCR    │
│ • Parse JSON    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Post-Processing │
│                 │
│ • Inferir ano   │
│ • Detectar      │
│   parcelas      │
│ • Calcular      │
│   due_date      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Staging Area   │
│                 │
│ • Revisar items │
│ • Aplicar       │
│   categorias    │
│ • Corrigir      │
│   valores       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Confirmação   │
│                 │
│ • Criar         │
│   transações    │
│ • Criar regras  │
│ • Gerar         │
│   parcelas      │
│   futuras       │
└─────────────────┘
```

**Detecção de Parcelas:**
```typescript
// Regex para detectar "3/10" ou "03/10"
const installmentRegex = /(\d{1,2})\/(\d{1,2})/;
const match = description.match(installmentRegex);

if (match) {
  installment_number = parseInt(match[1]);
  total_installments = parseInt(match[2]);
}
```

**Inferência de Ano:**
```typescript
// Se mês da compra > mês da fatura, compra foi no ano anterior
if (purchaseMonth > invoiceMonth) {
  year = invoiceYear - 1;
}
// Ex: Compra em DEZ/2025 para fatura JAN/2026
```

---

### 7.2 Importação de Extrato Bancário

```
┌─────────────────┐
│ Upload OFX/CSV  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Parser Local   │
│                 │
│ • OFX Parser    │
│ • CSV Parser    │
│ • Detectar      │
│   formato       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Detecção de    │
│  Duplicatas     │
│                 │
│ • Mesma data    │
│ • Mesmo valor   │
│ • Mesma desc.   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Staging Area   │
│                 │
│ • Revisar items │
│ • Aplicar       │
│   regras        │
│ • Marcar        │
│   duplicatas    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Confirmação   │
│                 │
│ • Criar         │
│   transações    │
│ • Criar regras  │
│   automáticas   │
└─────────────────┘
```

---

## 8. Hooks e Suas Responsabilidades

### 8.1 `useTransactions.ts`

**Responsabilidades:**
- CRUD de transações
- Cálculo de totais (income, expense)
- Paginação com "load more"
- Filtros por período, cartão, busca
- Sincronização automática de `current_invoice`

**Options disponíveis:**
```typescript
interface UseTransactionsOptions {
  showAll?: boolean;           // Ignora filtro de período
  loadedCount?: number;        // Limite de registros
  filterByDueDate?: boolean;   // Usa due_date ao invés de date
  creditCardFilter?: "only" | "exclude" | null;
  searchQuery?: string;
  useHybridDateFilter?: boolean; // Dashboard: date para contas, due_date para cartões
}
```

---

### 8.2 `useCreditCardInvoiceSync.ts`

**Responsabilidades:**
- Recalcular `current_invoice` após mudanças
- Garantir saldo nunca negativo
- Invalidar queries relacionadas

**Quando é chamado:**
- `createTransaction.onSuccess`
- `updateTransaction.onSuccess`
- `deleteTransaction.onSuccess`

---

### 8.3 `useCreditCardReconciliation.ts`

**Responsabilidades:**
- Calcular totais para reconciliação
- Separar despesas normais vs estornos
- Calcular discrepância com o banco

---

### 8.4 `useInstallmentGroup.ts`

**Responsabilidades:**
- Buscar todas as parcelas de um grupo
- Editar parcela individual
- Editar todas as parcelas em lote
- Excluir parcelas pendentes
- Adicionar novas parcelas

---

## 9. Componentes Principais

### 9.1 `TransactionModal`

**Funcionalidades:**
- Criar nova transação
- Editar transação existente
- Suporte a cartão de crédito e conta bancária
- Cálculo automático de `due_date`
- Preservação de `due_date` em edições simples
- Suporte a parcelamento
- Flags: corporativo, reembolsável, estorno

---

### 9.2 `PayInvoiceModal`

**Funcionalidades:**
- Pagamento split (corporativo/reembolsável/pessoal)
- Vinculação com transação bancária existente
- Detecção de fatura parcialmente paga
- Seção de saldo residual

**Estados:**
- **Fatura aberta:** Mostra seções de pagamento por tipo
- **Parcialmente paga:** Mostra apenas saldo residual
- **Paga:** Não permite novos pagamentos

---

### 9.3 `ReconciliationCard`

**Funcionalidades:**
- Comparar saldo do banco vs lançamentos
- Mostrar discrepância
- Link para relatório detalhado

---

## 10. Edge Functions

### 10.1 `parse-invoice`

**Localização:** `supabase/functions/parse-invoice/index.ts`

**Propósito:** OCR de faturas PDF usando Gemini 2.5 Pro

**Input:**
```typescript
{
  file: string;        // Base64 do PDF
  mimeType: string;    // "application/pdf"
  invoiceMonth: number;
  invoiceYear: number;
}
```

**Output:**
```typescript
{
  transactions: Array<{
    date: string;
    description: string;
    amount: number;
    installment_number?: number;
    total_installments?: number;
  }>;
}
```

---

### 10.2 `migrate-installments`

**Localização:** `supabase/functions/migrate-installments/index.ts`

**Propósito:** Migrar parcelamentos de formato legado para o novo formato com `installment_group_id`.

---

## 11. Troubleshooting

### Problema: Erro RLS "new row violates policy"

**Causa:** `user_id` não está sendo enviado ou está undefined.

**Solução:**
```typescript
if (!user?.id) {
  throw new Error("Usuário não autenticado");
}
// Agora sim, fazer o INSERT
```

---

### Problema: Soma de fatura incorreta

**Causa:** Estornos não estão sendo subtraídos.

**Verificar:**
```typescript
// ERRADO - ignora estornos
const total = transactions
  .filter(t => t.type === "expense" && !t.is_refund)
  .reduce(...);

// CORRETO - subtrai estornos
const normal = transactions.filter(t => !t.is_refund).reduce(...);
const refunds = transactions.filter(t => t.is_refund).reduce(...);
const total = normal - refunds;
```

---

### Problema: Transações não aparecem no período

**Causa:** Filtro usando `date` ao invés de `due_date` para cartões.

**Verificar:**
- Para faturas de cartão: usar `filterByDueDate: true`
- Para contas bancárias: usar `date`
- Para Dashboard: usar `useHybridDateFilter: true`

---

### Problema: Pagamento de fatura aparece como despesa

**Causa:** `is_card_payment` não está sendo verificado.

**Verificar:**
```typescript
// Excluir pagamentos de fatura
const realExpenses = transactions.filter(t => 
  t.type === "expense" && !t.is_card_payment
);
```

---

### Problema: `current_invoice` não atualiza

**Causa:** `syncInvoiceForCard` não está sendo chamado.

**Verificar:**
- `createTransaction.onSuccess` chama `syncInvoiceForCard`
- `updateTransaction.onSuccess` chama para old e new card
- `deleteTransaction.onSuccess` chama `syncInvoiceForCard`

---

## 12. Memórias Arquiteturais

### `architecture/security-safeguards`
Auth guards em todas as mutations de INSERT. Verificar `user?.id` antes de qualquer escrita.

### `architecture/code-standards`
Tipos centralizados em `src/types/index.ts`. Constantes de domínio em `src/lib/constants.ts`.

### `architecture/error-handling-standards`
Usar `logError()` ao invés de `console.log()`. Usar `getSafeErrorMessage()` para toasts.

### `features/invoice-balance-sync-logic`
`current_invoice` = Σ(despesas) - Σ(estornos) - Σ(pagamentos). Nunca negativo.

### `features/credit-card-reconciliation-logic`
Discrepância = Saldo do Banco - Total de Lançamentos. Inclui seção de saldo residual.

### `features/transaction-filtering-rules`
Dashboard usa `due_date` para cartões, `date` para contas. Filtro híbrido implementado.

### `features/installment-management-system`
CRUD completo de parcelas. Sincronização de categoria no grupo.

### `features/due-date-preservation-logic`
Preservar `due_date` original em edições simples. Recalcular apenas se data ou cartão mudar.

### `features/split-payment-flow`
Pagamento de fatura suporta split entre corporativo, reembolsável e pessoal.

### `architecture/data-integrity-standards`
Transações com `is_card_payment: true` devem ter `credit_card_id` válido.

---

## 13. Fluxos de UI e Interações do Usuário

### 13.1 Arquitetura de Navegação

#### Desktop (≥768px)
```
┌─────────────────────────────────────────────────────────────┐
│  Header (DateContext selector + User menu)                  │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│   Sidebar    │            Conteúdo Principal                │
│   (240px)    │                                              │
│              │                                              │
│  • Dashboard │                                              │
│  • Extrato   │                                              │
│  • Cartões   │                                              │
│  • Contas    │                                              │
│  • Categ.    │                                              │
│  • Orçamento │                                              │
│  • Invest.   │                                              │
│  • Relatórios│                                              │
│  • Config.   │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

#### Mobile (<768px)
```
┌─────────────────────────────────────────────────────────────┐
│  Header (Compacto - mês/ano + menu)                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                  Conteúdo Principal                         │
│                  (full width)                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  BottomNav                                                  │
│  ┌──────┬──────┬──────┬──────┬──────┐                      │
│  │ Home │Extrato│  +  │Cartões│ Mais │                      │
│  │  🏠  │  📋  │ FAB │  💳  │  ≡   │                      │
│  └──────┴──────┴──────┴──────┴──────┘                      │
└─────────────────────────────────────────────────────────────┘
```

**Componentes de Layout:**
| Componente | Arquivo | Responsabilidade |
|------------|---------|------------------|
| `MainLayout` | `src/components/layout/MainLayout.tsx` | Wrapper com Sidebar/BottomNav |
| `AppSidebar` | `src/components/layout/AppSidebar.tsx` | Menu lateral desktop |
| `BottomNav` | `src/components/layout/BottomNav.tsx` | Navegação mobile |
| `Header` | `src/components/layout/Header.tsx` | Cabeçalho com seletor de data |

---

### 13.2 Padrão de Modais Responsivos

O sistema usa `ResponsiveDialog` que renderiza:
- **Desktop:** `Dialog` (modal centralizado)
- **Mobile:** `Drawer` (bottom sheet deslizante)

```typescript
// src/components/ui/responsive-dialog.tsx
export function ResponsiveDialog({ children, ...props }) {
  const isMobile = useIsMobile();
  
  if (isMobile) {
    return <Drawer {...props}>{children}</Drawer>;
  }
  
  return <Dialog {...props}>{children}</Dialog>;
}
```

**Modais Principais e Seus Triggers:**

| Modal | Trigger | Arquivo |
|-------|---------|---------|
| `TransactionModal` | FAB (+), botão "Nova transação" | `src/components/modals/TransactionModal.tsx` |
| `CreditCardModal` | Botão "Novo cartão" | `src/components/modals/CreditCardModal.tsx` |
| `AccountModal` | Botão "Nova conta" | `src/components/modals/AccountModal.tsx` |
| `InvoiceImportModal` | Botão "Importar fatura" no card do cartão | `src/components/modals/InvoiceImportModal.tsx` |
| `PayInvoiceModal` | Botão "Pagar fatura" no card do cartão | `src/components/modals/PayInvoiceModal.tsx` |
| `AccountImportModal` | Botão "Importar extrato" na conta | `src/components/modals/AccountImportModal.tsx` |

---

### 13.3 Fluxos de Usuário Detalhados

#### 13.3.1 Fluxo: Criar Nova Transação

```
┌─────────────────┐
│ Usuário clica   │
│ no FAB (+)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TransactionModal│
│ abre            │
│                 │
│ Campos:         │
│ • Descrição     │
│ • Valor         │
│ • Tipo (toggle) │
│ • Data          │
│ • Conta/Cartão  │
│ • Categoria     │
│ • Parcelamento  │
│ • Flags         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Se Parcelado:   │
│ • Qtd parcelas  │
│ • Valor parcela │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Clica "Salvar"  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ createTransaction│
│ mutation        │
│                 │
│ Se cartão:      │
│ • Calcula       │
│   due_date      │
│ • Sync invoice  │
│                 │
│ Se parcelado:   │
│ • Gera todas    │
│   parcelas      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Toast "Sucesso" │
│ Modal fecha     │
│ Lista atualiza  │
└─────────────────┘
```

**Estados do Toggle de Tipo:**
```typescript
// Tipo alterna entre income/expense
<ToggleGroup type="single" value={type} onValueChange={setType}>
  <ToggleGroupItem value="income" className="text-income">
    Receita
  </ToggleGroupItem>
  <ToggleGroupItem value="expense" className="text-expense">
    Despesa
  </ToggleGroupItem>
</ToggleGroup>
```

---

#### 13.3.2 Fluxo: Importar Fatura de Cartão

```
┌─────────────────┐
│ Página Cartões  │
│                 │
│ Clica no card   │
│ do cartão       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Menu dropdown   │
│ aparece         │
│                 │
│ • Ver itens     │
│ • Importar      │◄── Clica aqui
│ • Pagar fatura  │
│ • Editar        │
│ • Excluir       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│InvoiceImportModal│
│                 │
│ Seleciona       │
│ arquivo:        │
│ • PDF (OCR)     │
│ • CSV           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ PDF selecionado │     │ CSV selecionado │
│                 │     │                 │
│ Envia para      │     │ Parser local    │
│ Edge Function   │     │ processa        │
│ (parse-invoice) │     │                 │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│ InvoiceReviewModal                       │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Lista de Transações Importadas      │ │
│ │                                     │ │
│ │ [✓] Mercado Livre  R$ 150,00  🛒   │ │
│ │ [✓] Netflix        R$ 45,90   🎬   │ │
│ │ [ ] DUPLICADO      R$ 45,90   ⚠️   │ │
│ │ [✓] Amazon 2/3     R$ 200,00  📦   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ • Checkbox para selecionar              │
│ • Detecta duplicatas                    │
│ • Permite editar categoria              │
│ • Mostra total selecionado              │
│                                         │
│ [Cancelar]           [Importar XX itens]│
└────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│ Para cada transação selecionada:        │
│                                         │
│ 1. Cria transação no DB                 │
│ 2. Marca imported_at = now()            │
│ 3. Calcula due_date baseado no cartão   │
│ 4. Gera parcelas futuras se parcelado   │
│ 5. Cria regra de categorização se nova  │
└─────────────────────────────────────────┘
```

---

#### 13.3.3 Fluxo: Pagar Fatura do Cartão

```
┌─────────────────┐
│ Clica "Pagar    │
│ fatura" no card │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ PayInvoiceModal                          │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Resumo da Fatura                    │ │
│ │ Saldo atual: R$ 5.234,56            │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 💼 Despesas Corporativas            │ │
│ │ R$ 1.500,00                         │ │
│ │                                     │ │
│ │ Conta: [Select - Empresa]           │ │
│ │ [ ] Vincular transação existente    │ │
│ │     └─ Busca transações candidatas  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 💰 Despesas Reembolsáveis           │ │
│ │ R$ 800,00                           │ │
│ │                                     │ │
│ │ Conta: [Select - Pessoal]           │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🏠 Despesas Pessoais                │ │
│ │ R$ 2.934,56                         │ │
│ │                                     │ │
│ │ Conta: [Select - Pessoal]           │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Cancelar]                  [Confirmar] │
└────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│ Para cada seção com conta selecionada:  │
│                                         │
│ 1. Cria transação de pagamento          │
│    • type = "expense"                   │
│    • is_card_payment = true             │
│    • credit_card_id = cartão            │
│    • account_id = conta selecionada     │
│                                         │
│ 2. Atualiza saldo da conta bancária     │
│                                         │
│ 3. Sync current_invoice do cartão       │
│    (subtrai o pagamento do saldo)       │
└─────────────────────────────────────────┘
```

**Estados do Modal de Pagamento:**

| Estado | Condição | UI |
|--------|----------|-----|
| Fatura em aberto | `current_invoice > 0` | Mostra seções Corporate/Reembolsável/Pessoal |
| Parcialmente paga | `current_invoice < transactionsTotal` | Mostra apenas "Saldo Residual" |
| Fatura zerada | `current_invoice = 0` | Mostra mensagem "Fatura já paga" |

---

#### 13.3.4 Fluxo: Visualizar Reconciliação

```
┌─────────────────┐
│ Página Cartões  │
│                 │
│ Clica no card   │
│ "Reconciliação" │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ ReconciliationDetailModal               │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Grid de Resumo (4 cards)            │ │
│ │                                     │ │
│ │ ┌────────┐ ┌────────┐ ┌────────┐   │ │
│ │ │ Fatura │ │ Lanç.  │ │ Difer. │   │ │
│ │ │ Banco  │ │ Sistema│ │ +/-    │   │ │
│ │ │R$5.234 │ │R$5.134 │ │+R$100  │   │ │
│ │ └────────┘ └────────┘ └────────┘   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Tabs                                │ │
│ │ [Transações] [Divergência] [Cálculo]│ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Tab "Transações":                       │
│ • Tabela com todas as transações        │
│ • Filtros por status, tipo, busca       │
│ • Badges: Importada/Manual, Estorno     │
│                                         │
│ Tab "Divergência":                      │
│ • InvoiceDiscrepancyReport              │
│ • Breakdown Corporate vs Pessoal        │
│                                         │
│ Tab "Cálculo":                          │
│ • InvoiceBreakdownCard                  │
│ • Mostra fórmula visual                 │
└─────────────────────────────────────────┘
```

---

### 13.4 Padrões de Formulário

#### Input Monetário (Mobile-First)
```typescript
// Padrão para inputs de valor
<Input
  type="number"
  inputMode="decimal"    // Teclado numérico com decimais no mobile
  step="0.01"            // Permite centavos
  min="0"
  placeholder="0,00"
/>
```

#### Seleção de Categoria
```typescript
// CategorySelector - componente reutilizável
<CategorySelector
  value={categoryId}
  onChange={setCategoryId}
  type="expense"         // Filtra por tipo
  allowSubcategories     // Mostra hierarquia
/>

// Renderiza como:
// 🛒 Alimentação
//    └ 🍕 Delivery
//    └ 🛍️ Supermercado
// 🎬 Entretenimento
//    └ 📺 Streaming
```

#### Seleção de Data
```typescript
// Usa react-day-picker com locale pt-BR
<Popover>
  <PopoverTrigger>
    <Button variant="outline">
      {format(date, "dd/MM/yyyy", { locale: ptBR })}
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      locale={ptBR}
    />
  </PopoverContent>
</Popover>
```

---

### 13.5 Feedbacks Visuais

#### Toasts (Sonner)
```typescript
// Sucesso
toast.success("Transação criada com sucesso");

// Erro
toast.error("Erro ao criar transação", {
  description: error.message
});

// Com ação
toast("Transação excluída", {
  action: {
    label: "Desfazer",
    onClick: () => undoDelete()
  }
});
```

#### Loading States
```typescript
// Skeleton durante carregamento
{isLoading ? (
  <Skeleton className="h-20 w-full" />
) : (
  <Card>{content}</Card>
)}

// Botão com loading
<Button disabled={isPending}>
  {isPending ? (
    <><Loader2 className="animate-spin" /> Salvando...</>
  ) : (
    "Salvar"
  )}
</Button>
```

#### Badges de Status
| Status | Cor | Uso |
|--------|-----|-----|
| `completed` | `bg-income/10 text-income` | Transação concluída |
| `pending` | `bg-primary/10 text-primary` | Transação pendente |
| `is_refund` | `bg-income/10 text-income` | Estorno |
| `is_corporate` | `bg-muted` | Gasto corporativo |
| Importada | `border-primary/30` | Via importação |
| Manual | `border-muted-foreground/30` | Criada manualmente |

---

### 13.6 Interações por Página

#### Dashboard (`/`)
| Elemento | Interação | Resultado |
|----------|-----------|-----------|
| SummaryCard | Clique | Abre sheet com detalhes |
| CategoryChart (pizza) | Clique em fatia | Abre `CategoryDetailSheet` |
| BalanceChart (linha) | Hover | Tooltip com valores do dia |
| BudgetEvolutionChart | Hover | Tooltip com planejado vs real |
| Card de categoria | Clique | Abre `CategoryDetailSheet` |
| Subcategoria | Clique | Abre `ParentCategoryDetailSheet` |

#### Transações (`/transactions`)
| Elemento | Interação | Resultado |
|----------|-----------|-----------|
| Tabs (Geral/Banco/Cartão) | Clique | Filtra transações |
| Linha da tabela | Clique | Abre `TransactionModal` (edição) |
| Botão filtros | Clique | Abre `TransactionFiltersModal` |
| Botão "Carregar mais" | Clique | Busca próxima página |
| Checkbox "Mostrar pendentes" | Toggle | Alterna filtro |

#### Cartões de Crédito (`/credit-cards`)
| Elemento | Interação | Resultado |
|----------|-----------|-----------|
| Card do cartão | Clique | Abre dropdown menu |
| Menu > Ver itens | Clique | Abre `InvoiceItemsModal` |
| Menu > Importar | Clique | Abre `InvoiceImportModal` |
| Menu > Pagar fatura | Clique | Abre `PayInvoiceModal` |
| Menu > Editar | Clique | Abre `CreditCardModal` |
| Card Reconciliação | Clique | Abre `ReconciliationDetailModal` |
| InstallmentsDashboard | Clique em parcela | Abre `InstallmentDetailsSheet` |

#### Investimentos (`/investments`)
| Elemento | Interação | Resultado |
|----------|-----------|-----------|
| AllocationChart (donut) | Hover | Tooltip com % e valor |
| Linha da AssetTable | Clique | Abre `AssetModal` (edição) |
| Botão operação | Clique | Abre `OperationModal` |
| Card instituição | Clique | Abre `InstitutionModal` |
| Botão atualizar preços | Clique | Abre `UpdatePricesModal` |

---

### 13.7 Responsividade Mobile

#### Tabelas → Cards
```typescript
// Desktop: Table normal
<Table>
  <TableHeader>...</TableHeader>
  <TableBody>
    {items.map(item => <TableRow>...</TableRow>)}
  </TableBody>
</Table>

// Mobile: Card layout
{isMobile ? (
  <div className="space-y-3">
    {items.map(item => (
      <Card className="p-4">
        <div className="flex justify-between">
          <span>{item.description}</span>
          <span>{formatCurrency(item.amount)}</span>
        </div>
      </Card>
    ))}
  </div>
) : (
  <Table>...</Table>
)}
```

#### Dialogs → Drawers
```typescript
// Usa hook useIsMobile
const isMobile = useIsMobile();

// Renderização condicional
return isMobile ? (
  <Drawer open={open} onOpenChange={setOpen}>
    <DrawerContent className="h-[85vh]">
      {content}
    </DrawerContent>
  </Drawer>
) : (
  <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="max-w-lg">
      {content}
    </DialogContent>
  </Dialog>
);
```

#### Grids Adaptativos
```typescript
// Grid responsivo
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {cards.map(card => <Card>{card}</Card>)}
</div>
```

---

### 13.8 Atalhos de Teclado

| Atalho | Ação | Contexto |
|--------|------|----------|
| `Escape` | Fecha modal | Qualquer modal aberto |
| `Enter` | Confirma/Submete | Formulários |
| `Tab` | Navega entre campos | Formulários |

---

### 13.9 Acessibilidade

- **ARIA Labels:** Todos os botões de ícone têm `aria-label`
- **Focus Management:** Modais capturam foco
- **Keyboard Navigation:** Menus navegáveis por teclado
- **Color Contrast:** Tokens de cor respeitam contraste mínimo
- **Screen Reader:** Badges e status têm texto alternativo

---

## 📝 Notas Finais

Este documento foi criado para servir como contexto completo do sistema LA Financeiro para IAs externas. Todas as regras de negócio, fórmulas de cálculo e padrões de código estão documentados aqui.

**Ao fazer modificações:**
1. Verificar se a mudança afeta alguma regra de negócio documentada
2. Atualizar as fórmulas de cálculo se necessário
3. Manter a consistência entre todos os locais que calculam totais
4. Sempre verificar autenticação antes de INSERT
5. Testar reconciliação após mudanças em transações

**Versão do Documento:** 2.0  
**Data:** Janeiro 2026

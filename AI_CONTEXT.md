# LA Financeiro - Documentação Técnica Completa

> **Última Atualização:** Março 2026  
> **Versão:** 3.1  
> **URL de Produção:** https://lafinaceiro.lovable.app  
> **Propósito:** Fonte de verdade única para IAs assistentes. Leia ANTES de qualquer modificação.

---

## 📋 Índice

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Schema do Banco de Dados (14 tabelas)](#2-schema-do-banco-de-dados)
3. [Regras de Negócio Críticas](#3-regras-de-negócio-críticas)
4. [Fórmulas de Cálculo](#4-fórmulas-de-cálculo)
5. [Estrutura de Arquivos](#5-estrutura-de-arquivos)
6. [Padrões de Segurança](#6-padrões-de-segurança)
7. [Padrões de Código e UI](#7-padrões-de-código-e-ui)
8. [Padrões Mobile](#8-padrões-mobile)
9. [Hooks e Suas Responsabilidades](#9-hooks-e-suas-responsabilidades)
10. [Edge Functions](#10-edge-functions)
11. [Fluxos de Usuário](#11-fluxos-de-usuário)
12. [Troubleshooting](#12-troubleshooting)
13. [Memórias Arquiteturais](#13-memórias-arquiteturais)
14. [Armadilhas a Evitar (Checklist)](#14-armadilhas-a-evitar)

---

## 1. Visão Geral do Sistema

### Stack Tecnológico

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | React 18 + Vite + TypeScript |
| **Estilização** | Tailwind CSS + shadcn/ui + Radix UI |
| **Estado** | TanStack React Query v5 |
| **Roteamento** | React Router v6 |
| **Backend** | Lovable Cloud (Supabase) |
| **Banco de Dados** | PostgreSQL (via Supabase) |
| **Autenticação** | Supabase Auth (email/password) |
| **OCR/IA** | Google Gemini 2.5 Pro |
| **Gráficos** | Recharts |
| **Tema** | next-themes (dark/light mode) |

### Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Pages     │  │ Components  │  │      Hooks          │  │
│  │ (17 rotas)  │  │ (50+ comp.) │  │ (20+ React Query)   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         └────────────────┼─────────────────────┘             │
│                          ▼                                   │
│              ┌───────────────────────┐                       │
│              │   Supabase Client     │                       │
│              └───────────┬───────────┘                       │
└──────────────────────────┼───────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     LOVABLE CLOUD                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  PostgreSQL │  │    Auth     │  │   Edge Functions    │  │
│  │ (14 tables) │  │             │  │  (4 functions)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               Row Level Security (RLS)                  │ │
│  │    Todas as tabelas protegidas por user_id + shared     │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Design System

- **Layout:** Cards com bordas suaves e acentos coloridos
- **Navegação Desktop:** Sidebar colapsável à esquerda
- **Navegação Mobile:** Bottom Navigation Bar fixa
- **Componentes:** Radix UI primitives via shadcn/ui
- **Cores:** Sistema de tokens semânticos HSL em `index.css`
- **Modais:** `ResponsiveDialog` (Dialog desktop / Drawer mobile)

---

## 2. Schema do Banco de Dados

### 2.1 Tabela: `transactions` (PRINCIPAL)

Tabela central que armazena todas as movimentações financeiras.

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | UUID | Não | `gen_random_uuid()` | Identificador único |
| `user_id` | UUID | Não | - | Proprietário da transação |
| `account_id` | UUID | Sim | - | Conta bancária (null se cartão) |
| `credit_card_id` | UUID | Sim | - | Cartão de crédito (null se conta) |
| `category_id` | UUID | Sim | - | Categoria da transação |
| `description` | TEXT | Não | - | Descrição do lançamento |
| `amount` | NUMERIC | Não | - | Valor (positivo sempre) |
| `type` | TEXT | Não | - | `"income"` ou `"expense"` |
| `date` | DATE | Não | `CURRENT_DATE` | **Data da compra** (ou data do débito para parcelas em conta) |
| `due_date` | DATE | Sim | - | **Data de vencimento/competência** |
| `status` | TEXT | Não | `'completed'` | `"completed"`, `"pending"` |
| `is_provisional` | BOOLEAN | Não | `false` | Transação gerada por regra recorrente (provisória) |
| `recurring_rule_id` | UUID | Sim | - | Regra recorrente que gerou esta transação |
| `is_corporate_expense` | BOOLEAN | Não | `false` | Gasto da empresa no cartão pessoal |
| `is_reimbursable` | BOOLEAN | Não | `false` | Despesa a ser reembolsada |
| `is_card_payment` | BOOLEAN | Sim | `false` | **Pagamento de fatura (NÃO É DESPESA!)** |
| `is_refund` | BOOLEAN | Não | `false` | Estorno/reembolso |
| `refunded_transaction_id` | UUID | Sim | - | Transação original do estorno |
| `installment_group_id` | UUID | Sim | - | **Agrupa parcelas da mesma compra** |
| `installment_number` | INTEGER | Sim | - | Parcela atual (ex: 3) |
| `total_installments` | INTEGER | Sim | - | Total de parcelas (ex: 10) |
| `reimbursement_status` | TEXT | Sim | `'pending'` | `"pending"`, `"requested"`, `"reimbursed"` |
| `imported_at` | TIMESTAMP | Sim | - | Data do upload/importação |

#### Campos Críticos

```
┌─────────────────────────────────────────────────────────────────┐
│ date (Data da Compra / Débito)                                  │
│   → Para cartões: quando a compra FOI FEITA                     │
│   → Para contas parceladas: data do débito (= due_date)         │
│   → Usado para filtros mensais e relatórios                     │
│                                                                 │
│ due_date (Competência da Fatura / Vencimento)                   │
│   → Cartões: em qual FATURA a compra aparece                    │
│   → Contas: data de vencimento do débito                        │
│   → Calculada com base na closing_date do cartão (para cartões) │
│   → Informada pelo usuário (para contas)                        │
│   → Dashboard de cartões filtra por due_date!                   │
│                                                                 │
│ is_card_payment                                                 │
│   → Pagamento de fatura = TRANSFERÊNCIA (conta → cartão)        │
│   → NÃO é despesa real                                          │
│   → DEVE SER EXCLUÍDO dos totais de despesas                    │
│                                                                 │
│ is_provisional                                                  │
│   → Transação gerada automaticamente por regra recorrente       │
│   → EXCLUÍDA dos totais (receitas e despesas)                   │
│   → Serve como "projeção" do que está por vir no mês            │
│                                                                 │
│ status: "pending"                                               │
│   → Transação com vencimento futuro (promessa de débito)        │
│   → EXCLUÍDA dos totais (receitas e despesas)                   │
│   → Auto-atribuído quando due_date é futuro (para contas)       │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Tabela: `credit_cards`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | UUID | Não | `gen_random_uuid()` | Identificador |
| `user_id` | UUID | Não | - | Proprietário |
| `name` | TEXT | Não | - | Nome do cartão |
| `last_digits` | TEXT | Não | - | Últimos 4 dígitos |
| `brand` | TEXT | Não | - | Bandeira (Visa, Mastercard) |
| `credit_limit` | NUMERIC | Não | 0 | Limite de crédito |
| `current_invoice` | NUMERIC | Não | 0 | **Saldo atual da fatura (sync automático)** |
| `closing_date` | INTEGER | Não | 3 | Dia do fechamento (1-31) |
| `due_date` | INTEGER | Não | 10 | Dia do vencimento (1-31) |
| `color` | TEXT | Sim | gradient | Cor CSS gradient |
| `status` | TEXT | Não | `'open'` | `"open"`, `"closed"`, `"paid"` |

#### `current_invoice` — Sincronização Automática

O saldo é recalculado via `useCreditCardInvoiceSync`:

```typescript
current_invoice = Σ(completed expenses) - Σ(refunds) - Σ(card payments)
// Nunca negativo: Math.max(0, invoiceTotal)
```

---

### 2.3 Tabela: `credit_card_invoices` (Ciclos de Fatura)

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | UUID | Não | `gen_random_uuid()` | Identificador |
| `user_id` | UUID | Não | - | Proprietário |
| `credit_card_id` | UUID | Não | - | Cartão vinculado |
| `month` | INTEGER | Não | - | Mês (1-12) |
| `year` | INTEGER | Não | - | Ano |
| `status` | TEXT | Não | `'open'` | `"open"`, `"closed"`, `"paid"` |
| `closed_amount` | NUMERIC | Sim | - | Valor no momento do fechamento |
| `due_date` | DATE | Sim | - | Data de vencimento |
| `closing_date` | DATE | Sim | - | Data de fechamento |
| `closed_at` | TIMESTAMP | Sim | - | Quando foi fechada |

**Regras:** Fatura `"closed"` bloqueia criação, edição e exclusão de transações naquele período.

---

### 2.4 Tabela: `accounts`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | UUID | Não | `gen_random_uuid()` | Identificador |
| `user_id` | UUID | Não | - | Proprietário |
| `name` | TEXT | Não | - | Nome da conta |
| `type` | TEXT | Não | - | `"checking"`, `"savings"`, `"investment"`, `"wallet"` |
| `current_balance` | NUMERIC | Não | 0 | Saldo atual |
| `icon` | TEXT | Sim | `'🏦'` | Emoji |
| `color` | TEXT | Sim | gradient | Cor CSS gradient |

---

### 2.5 Tabela: `categories`

Suporta **hierarquia de dois níveis** (categoria pai → subcategorias).

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | UUID | Não | `gen_random_uuid()` | Identificador |
| `user_id` | UUID | Não | - | Proprietário |
| `name` | TEXT | Não | - | Nome |
| `type` | TEXT | Não | - | `"income"` ou `"expense"` |
| `parent_id` | UUID | Sim | null | Categoria pai (null = raiz) |
| `icon` | TEXT | Sim | `'📦'` | Emoji |
| `color` | TEXT | Sim | `'#3B82F6'` | Cor hexadecimal |

---

### 2.6 Tabela: `categorization_rules`

Regras automáticas para categorizar transações importadas.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `keyword` | TEXT | Palavra-chave (case insensitive) |
| `category_id` | UUID | Categoria a aplicar |
| `is_corporate` | BOOLEAN | Marca como corporativo automaticamente |

---

### 2.7 Tabela: `budgets`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `category_id` | UUID | Categoria vinculada |
| `planned_amount` | NUMERIC | Valor planejado |
| `month` | INTEGER | Mês (1-12) |
| `year` | INTEGER | Ano |

---

### 2.8 Tabela: `investment_institutions`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | TEXT | Nome (XP, Rico, NuInvest) |
| `icon` | TEXT | Emoji |
| `color` | TEXT | Cor hexadecimal |

---

### 2.9 Tabela: `investment_assets`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `institution_id` | UUID | Sim | null | Instituição financeira |
| `name` | TEXT | Não | - | Nome do ativo |
| `ticker` | TEXT | Não | - | Código (PETR4, MXRF11) |
| `asset_type` | TEXT | Não | - | `"renda_fixa"`, `"renda_variavel"`, `"fiis"`, `"crypto"`, `"saldo_corretora"` |
| `quantity` | NUMERIC | Não | 0 | Quantidade |
| `average_price` | NUMERIC | Não | 0 | Preço médio ponderado (calculado) |
| `current_price` | NUMERIC | Não | 0 | Cotação atual |
| `current_balance` | NUMERIC | Sim | 0 | Saldo atual (para renda fixa) |
| `pricing_method` | TEXT | Sim | `'unit_price'` | Método de precificação |
| `maturity_date` | DATE | Sim | null | Vencimento (renda fixa) |
| `yield_info` | TEXT | Sim | null | Info de rendimento |
| `liquidity` | TEXT | Sim | null | Liquidez |

---

### 2.10 Tabela: `investment_transactions`

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `asset_id` | UUID | Sim | null | Ativo vinculado |
| `type` | TEXT | Não | - | `"buy"`, `"sell"`, `"dividend"`, `"yield"` |
| `quantity` | NUMERIC | Não | 0 | Quantidade |
| `unit_price` | NUMERIC | Não | 0 | Preço unitário |
| `fees` | NUMERIC | Não | 0 | Taxas |
| `total_value` | NUMERIC | Não | 0 | Valor total |
| `date` | DATE | Não | CURRENT_DATE | Data da operação |
| `realized_profit` | NUMERIC | Sim | null | Lucro realizado (vendas) |
| `linked_transaction_id` | UUID | Sim | null | Transação financeira vinculada |
| `notes` | TEXT | Sim | null | Observações |

---

### 2.11 Tabela: `profiles`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Mesmo ID do auth.users |
| `email` | TEXT | Email |
| `full_name` | TEXT | Nome completo |
| `avatar_url` | TEXT | URL do avatar |

---

### 2.12 Tabela: `shared_access`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `owner_id` | UUID | Usuário que compartilha |
| `shared_with_user_id` | UUID | Usuário que recebe acesso |

---

### 2.13 Tabela: `invitations`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `owner_id` | UUID | Quem convida |
| `invited_email` | TEXT | Email do convidado |
| `invited_user_id` | UUID | ID após aceite |
| `status` | TEXT | `"pending"`, `"accepted"`, `"rejected"` |

---

### 2.14 Tabela: `recurring_rules`

Regras para geração automática de transações provisórias mensais.

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `id` | UUID | Não | `gen_random_uuid()` | Identificador |
| `user_id` | UUID | Não | - | Proprietário |
| `description` | TEXT | Não | - | Descrição do lançamento |
| `category_id` | UUID | Sim | - | Categoria vinculada |
| `account_id` | UUID | Sim | - | Conta bancária |
| `credit_card_id` | UUID | Sim | - | Cartão de crédito |
| `estimated_amount` | NUMERIC | Não | 0 | Valor estimado |
| `type` | TEXT | Não | - | `"income"` ou `"expense"` |
| `day_of_month` | INTEGER | Não | 1 | Dia do mês (1-31) |
| `active` | BOOLEAN | Não | `true` | Regra ativa |

**Funcionamento:** O hook `useRecurringGenerator` gera transações provisórias (`is_provisional: true`) para o mês corrente com base nas regras ativas. As transações provisórias são excluídas dos totais de receitas e despesas.

---

### Diagrama de Relacionamentos

```
┌─────────────────┐
│     profiles    │
│   (id = user)   │
└────────┬────────┘
         │ user_id
         ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   transactions  │◄────►│   credit_cards  │      │    accounts     │
│ credit_card_id  │      │                 │      │                 │
│ account_id      │      │                 │      │                 │
│ category_id     │      │                 │      │                 │
└────────┬────────┘      └────────┬────────┘      └─────────────────┘
         │                        │
         │ category_id            │ credit_card_id
         ▼                        ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   categories    │◄────►│     budgets     │      │credit_card_     │
│ parent_id (self)│      │ category_id     │      │invoices         │
└─────────────────┘      └─────────────────┘      └─────────────────┘

┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ inv_institutions│◄────►│ inv_assets      │◄────►│ inv_transactions│
│                 │      │ institution_id  │      │ asset_id        │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## 3. Regras de Negócio Críticas

### ⚠️ 3.1 Pagamento de Fatura NÃO É Despesa

```typescript
// Pagamento de fatura é TRANSFERÊNCIA (conta → cartão)
{
  type: 'expense',
  is_card_payment: true,  // ← FLAG CRÍTICA
  account_id: 'conta-corrente',
  credit_card_id: 'cartao-id',
}

// SEMPRE excluir dos relatórios de despesas:
.filter(t => !t.is_card_payment)
```

---

### ⚠️ 3.2 `date` vs `due_date`

| Campo | Significado | Quando Usar |
|-------|-------------|-------------|
| `date` | Data da compra (imutável) | Histórico, relatórios |
| `due_date` | Competência da fatura | Filtros de fatura, Dashboard de cartões |

**Regra de cálculo do `due_date`:**
```typescript
if (purchaseDay <= closingDate) {
  due_date = mês_atual
} else {
  due_date = mês_seguinte
}
```

**Inferência de Ano (importação de PDF):**
```typescript
if (purchaseMonth > invoiceMonth) {
  year = invoiceYear - 1;
}
// Ex: Compra DEZ para fatura JAN → ano anterior
```

---

### ⚠️ 3.3 Estornos/Reembolsos

```typescript
// Estorno = despesa com is_refund: true
// Subtrai do total de despesas da categoria original
totalExpense = normalExpenses - expenseRefunds
```

---

### ⚠️ 3.4 Gastos Corporativos vs Reembolsáveis

| Flag | Significado | Aparece em relatórios pessoais? |
|------|-------------|--------------------------------|
| `is_corporate_expense` | Gasto da EMPRESA no cartão pessoal | ❌ Não |
| `is_reimbursable` | Gasto pessoal que será reembolsado | ❌ Não |
| Nenhum | Gasto pessoal normal | ✅ Sim |

---

### ⚠️ 3.5 Parcelamentos

Parcelas são suportadas tanto em **cartões de crédito** quanto em **débito em conta**.

```typescript
// Parcelas agrupadas por installment_group_id
{
  installment_group_id: 'uuid-unico', // MESMO para todas as parcelas
  installment_number: 3,              // Parcela atual
  total_installments: 10,             // Total
  due_date: '2025-01-10',             // Incrementa +1 mês por parcela
}

// Regras:
// - Editar categoria de 1 parcela → atualiza TODAS do grupo
// - Parcelas pendentes podem ser removidas em lote
```

#### Cálculo de Datas das Parcelas (baseDate)

```typescript
// Para CARTÃO: baseDate = data da compra (due_date calculado pelo fechamento)
// Para CONTA:  baseDate = dueDate informado pelo usuário
const baseDate = (paymentMethod === "account" && dueDate) ? dueDate : date;
const installmentDate = addMonths(baseDate, i - installmentNumber);
```

#### Parcelas em Conta (Débito em Conta)

- Usam `account_id` em vez de `credit_card_id`
- `date` e `due_date` são iguais (= data do débito)
- Parcelas futuras recebem `status: "pending"` automaticamente
- Exemplos: financiamentos, consórcios, seguros parcelados

---

### ⚠️ 3.6 Sincronização de `current_invoice`

```typescript
// useCreditCardInvoiceSync recalcula após criar/editar/excluir transação
let invoiceTotal = 0;

for (const tx of transactions) {
  if (tx.status !== "completed") continue;
  
  if (tx.is_card_payment) {
    invoiceTotal -= tx.amount;     // Pagamentos reduzem
  } else if (tx.type === "expense") {
    if (tx.is_refund) {
      invoiceTotal -= tx.amount;   // Estornos reduzem
    } else {
      invoiceTotal += tx.amount;   // Despesas aumentam
    }
  }
}

invoiceTotal = Math.max(0, invoiceTotal); // Nunca negativo
```

---

### ⚠️ 3.7 Preservação de `due_date`

Ao editar transação existente:
- Mudar apenas categoria/descrição → **mantém** `due_date` original
- Mudar data da compra → **recalcula** `due_date`
- Mudar cartão → **recalcula** `due_date`

---

### ⚠️ 3.8 Ciclos de Fatura (Fechar/Reabrir)

- Fatura `"closed"` → **bloqueia** criação, edição e exclusão de transações naquele período
- Fatura `"open"` → operações liberadas
- Fatura `"paid"` → pagamento registrado

O hook `useInvoiceCycles` gerencia os estados. `useTransactions` verifica o status antes de mutações.

---

## 4. Fórmulas de Cálculo

### 4.1 Total de Despesas

```typescript
const normalExpenses = transactions
  .filter(t => t.type === "expense" && !t.is_refund && !t.is_card_payment 
    && !t.is_corporate_expense && !t.is_reimbursable
    && !t.is_provisional && t.status !== "pending")  // ← Exclui projeções e pendentes
  .reduce((sum, t) => sum + Number(t.amount), 0);

const expenseRefunds = transactions
  .filter(t => t.type === "expense" && t.is_refund 
    && !t.is_corporate_expense && !t.is_reimbursable
    && !t.is_provisional && t.status !== "pending")  // ← Exclui projeções e pendentes
  .reduce((sum, t) => sum + Number(t.amount), 0);

const totalExpense = normalExpenses - expenseRefunds;
```

### 4.2 Total de Receitas

```typescript
const totalIncome = transactions
  .filter(t => t.type === "income" && !t.is_refund && !t.is_corporate_expense
    && !t.is_provisional && t.status !== "pending")  // ← Exclui projeções e pendentes
  .reduce((sum, t) => sum + Number(t.amount), 0);
```

### 4.3 Reconciliação de Fatura

```typescript
const transactionsTotal = normalTotal - refundTotal;
const discrepancy = current_invoice - transactionsTotal;
// discrepancy > 0: faltam lançamentos
// discrepancy < 0: sobraram lançamentos
```

### 4.4 Filtro Híbrido (Dashboard)

```typescript
// Contas bancárias: filtra por date
// Cartões de crédito: filtra por due_date
query = query.or(
  `and(credit_card_id.is.null,date.gte.${startDate},date.lte.${endDate}),` +
  `and(credit_card_id.not.is.null,due_date.gte.${startDate},due_date.lte.${endDate})`
);
```

### 4.5 Preço Médio de Investimentos

```typescript
// Na Compra:
const newQuantity = asset.quantity + purchaseQuantity;
const newAveragePrice = (asset.quantity * asset.average_price + purchaseQuantity * purchasePrice) / newQuantity;

// Na Venda: preço médio NÃO muda, só reduz quantity
// Lucro Realizado = (precoVenda - precoMedio) × quantidade
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
│   ├── useTransactions.ts         # CRUD transações (principal)
│   ├── useCreditCards.ts          # CRUD cartões
│   ├── useCreditCardInvoiceSync.ts# Sync automático de current_invoice
│   ├── useCreditCardReconciliation.ts # Lógica de conciliação
│   ├── useCreditCardTransactions.ts   # Transações de um cartão
│   ├── useCategories.ts           # CRUD categorias
│   ├── useAccounts.ts             # CRUD contas
│   ├── useBudgets.ts              # CRUD orçamentos
│   ├── useCategorizationRules.ts  # Regras automáticas
│   ├── useInstallmentGroup.ts     # Gestão de parcelas
│   ├── usePendingInstallments.ts  # Parcelas pendentes
│   ├── useExistingInstallments.ts # Deduplicação na importação
│   ├── useInstitutions.ts         # Instituições de investimento
│   ├── useInvestments.ts          # Ativos e operações
│   ├── useInvitations.ts          # Convites de acesso
│   ├── useInvoiceCycles.ts        # Ciclos de fatura (fechar/reabrir)
│   ├── useInvoiceTransactions.ts  # Transações da fatura
│   ├── useActivities.ts           # Log de importações
│   ├── useMembers.ts              # Gestão de membros
│   ├── useBankPaymentCandidates.ts# Candidatos para vincular pagamento
│   ├── useRecurringRules.ts       # CRUD regras recorrentes
│   ├── useRecurringGenerator.ts   # Geração de provisórias
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
│   ├── Activities.tsx             # Log de importações
│   ├── Settings.tsx               # Configurações + Membros
│   ├── Auth.tsx                   # Login/Signup
│   ├── ForgotPassword.tsx         # Recuperação de senha
│   ├── ResetPassword.tsx          # Reset de senha
│   └── NotFound.tsx               # 404
│
├── components/
│   ├── ui/                        # shadcn/ui (50+ components)
│   │   └── responsive-dialog.tsx  # Dialog/Drawer responsivo
│   │
│   ├── layout/
│   │   ├── MainLayout.tsx         # Layout principal
│   │   ├── AppSidebar.tsx         # Menu lateral (desktop)
│   │   ├── BottomNav.tsx          # Navegação (mobile)
│   │   └── Header.tsx             # Cabeçalho + seletor de mês
│   │
│   ├── dashboard/
│   │   ├── SummaryCard.tsx        # Cards de resumo
│   │   ├── BalanceChart.tsx       # Gráfico de saldo
│   │   ├── CategoryChart.tsx      # Gráfico por categoria
│   │   ├── BudgetEvolutionChart.tsx
│   │   ├── AllCategoriesList.tsx  # Lista de categorias
│   │   ├── CategoryDetailSheet.tsx
│   │   └── ParentCategoryDetailSheet.tsx
│   │
│   ├── credit-cards/
│   │   ├── InstallmentsDashboard.tsx
│   │   ├── InvoiceBreakdownCard.tsx
│   │   ├── ReconciliationCard.tsx
│   │   ├── ReconciliationDetailModal.tsx
│   │   ├── InvoiceDiscrepancyReport.tsx
│   │   ├── CloseInvoiceModal.tsx      # Fechar fatura
│   │   ├── ReopenInvoiceModal.tsx     # Reabrir fatura
│   │   ├── ClosedInvoiceBanner.tsx    # Banner de fatura fechada
│   │   └── InvoiceStatusBadge.tsx     # Badge de status
│   │
│   ├── investments/
│   │   ├── AllocationChart.tsx
│   │   ├── AssetTable.tsx / AssetModal.tsx
│   │   ├── InstitutionsList.tsx / InstitutionModal.tsx
│   │   ├── TransactionHistory.tsx
│   │   ├── OperationModal.tsx
│   │   ├── UpdatePricesModal.tsx
│   │   └── InvestmentSummaryCards.tsx
│   │
│   ├── modals/
│   │   ├── TransactionModal.tsx
│   │   ├── TransactionFiltersModal.tsx
│   │   ├── AccountModal.tsx / AccountImportModal.tsx / AccountReviewModal.tsx
│   │   ├── CreditCardModal.tsx
│   │   ├── InvoiceImportModal.tsx / InvoiceReviewModal.tsx / InvoiceItemsModal.tsx
│   │   ├── PayInvoiceModal.tsx
│   │   ├── AddInstallmentsModal.tsx / EditInstallmentsModal.tsx
│   │   ├── NewBudgetModal.tsx / EditBudgetModal.tsx
│   │   ├── AddSubcategoryModal.tsx / DeleteCategoryModal.tsx
│   │   └── ...
│   │
│   ├── reports/
│   │   └── RefundReport.tsx
│   │
│   ├── settings/
│   │   ├── MembersSection.tsx
│   │   └── InstallmentMigration.tsx
│   │
│   ├── CategorySelector.tsx
│   └── InstallmentDetailsSheet.tsx
│
├── integrations/supabase/
│   ├── client.ts                  # AUTO-GERADO
│   └── types.ts                   # AUTO-GERADO
│
├── lib/
│   ├── utils.ts                   # cn, formatCurrency
│   ├── constants.ts               # Constantes do domínio
│   ├── errorHandler.ts            # logError, getSafeErrorMessage
│   ├── csvParser.ts / csvInvoiceParser.ts / ofxParser.ts
│   └── bankConfig.ts              # Configurações por banco
│
├── types/
│   └── index.ts                   # Tipos centralizados
│
└── config/
    └── version.ts

supabase/
├── config.toml
└── functions/
    ├── parse-invoice/index.ts
    ├── migrate-installments/index.ts
    ├── add-member/index.ts
    └── admin-reset-password/index.ts
```

---

## 6. Padrões de Segurança

### 6.1 Row Level Security (RLS)

Todas as tabelas têm RLS habilitado:

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

-- INSERT/DELETE: apenas próprios dados (auth.uid() = user_id)
-- UPDATE: próprios ou compartilhados (mesma lógica de SELECT)
```

### 6.2 Auth Guards em Mutations

```typescript
// OBRIGATÓRIO antes de INSERT
if (!user?.id) {
  throw new Error("Usuário não autenticado");
}
```

### 6.3 Tratamento de Erros

```typescript
import { logError, getSafeErrorMessage } from "@/lib/errorHandler";

// Nunca expor detalhes internos ao usuário
catch (error) {
  logError(error as Error, "NomeDaFuncao");
  toast({
    title: "Erro",
    description: getSafeErrorMessage(error),
    variant: "destructive",
  });
}
```

### 6.4 Edge Functions

| Aspecto | Implementação |
|---------|---------------|
| Autenticação | `verify_jwt = false` (validação manual quando necessário) |
| CORS | Headers configurados |
| Secrets | `GOOGLE_AI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

---

## 7. Padrões de Código e UI

### 7.1 React Query Hooks

```typescript
import { useTransactions } from '@/hooks/useTransactions';
const { transactions, isLoading, createTransaction, updateTransaction } = useTransactions();
```

### 7.2 Queries Supabase

```typescript
import { supabase } from '@/integrations/supabase/client';

const { data, error } = await supabase
  .from('transactions')
  .select('*, categories(*), accounts(*)')
  .eq('user_id', userId)
  .order('date', { ascending: false });
```

### 7.3 ResponsiveDialog

```typescript
// Componente unificado: Dialog no desktop, Drawer no mobile
// src/components/ui/responsive-dialog.tsx
<ResponsiveDialog open={open} onOpenChange={setOpen}>
  <ResponsiveDialogContent>
    {/* conteúdo */}
  </ResponsiveDialogContent>
</ResponsiveDialog>
```

### 7.4 Nomenclatura

| Tipo | Convenção | Exemplo |
|------|-----------|---------|
| Componentes | PascalCase | `TransactionModal.tsx` |
| Hooks | camelCase + "use" | `useTransactions.ts` |
| Utilitários | camelCase | `formatCurrency()` |
| Tipos | PascalCase | `Transaction` |
| Constantes | UPPER_SNAKE_CASE | `DEFAULT_PAGE_SIZE` |

### 7.5 Convenções

- **Datas:** `date-fns` com locale `ptBR`, formato `dd/MM/yyyy`
- **Moeda:** `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
- **Cores de categoria:** Hex (`#3B82F6`)
- **Cores de cards/contas:** Gradiente Tailwind (`from-purple-500 to-purple-600`)
- **Ícones de categoria:** Emoji (`🍔`)
- **Ícones de componente:** Lucide React

---

## 8. Padrões Mobile

### 8.1 `data-vaul-no-drag`

**OBRIGATÓRIO** em áreas roláveis dentro de Drawers para evitar conflito com gestos:

```tsx
<ScrollArea>
  <div data-vaul-no-drag>
    {/* conteúdo rolável */}
  </div>
</ScrollArea>
```

### 8.2 Seletores Inline (NÃO Popover/Portal)

Dentro de Drawers no mobile, **NÃO usar Popover/Portal** para seletores (conflito de foco do Radix). Usar lista inline expansível:

```tsx
// ❌ ERRADO dentro de Drawer mobile
<Popover>
  <PopoverContent>{/* seletor */}</PopoverContent>
</Popover>

// ✅ CORRETO dentro de Drawer mobile
{showCategories && (
  <div className="border rounded-md p-2">
    {categories.map(cat => <button onClick={() => select(cat)}>{cat.name}</button>)}
  </div>
)}
```

### 8.3 Bottom Navigation Bar

Mobile usa BottomNav fixo com 5 itens: Home, Extrato, FAB (+), Cartões, Mais.

### 8.4 Tabelas → Cards

```typescript
// Desktop: <Table>
// Mobile: Cards empilhados
{isMobile ? (
  <div className="space-y-3">
    {items.map(item => <Card>...</Card>)}
  </div>
) : (
  <Table>...</Table>
)}
```

### 8.5 Input Monetário

```tsx
<Input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0,00" />
```

---

## 9. Hooks e Suas Responsabilidades

### 9.1 `useTransactions`

CRUD principal. Recebe opções de filtragem:

```typescript
interface UseTransactionsOptions {
  showAll?: boolean;               // Ignora filtro de período
  loadedCount?: number;            // Paginação
  filterByDueDate?: boolean;       // Filtra por due_date
  creditCardFilter?: "only" | "exclude" | null;
  searchQuery?: string;
  useHybridDateFilter?: boolean;   // Dashboard: date para contas, due_date para cartões
}
```

Retorna: `transactions`, `totalIncome`, `totalExpense`, `hasMore`, `createTransaction`, `updateTransaction`, `deleteTransaction`

Verifica `checkInvoiceClosed` antes de mutações em cartão.

---

### 9.2 `useCreditCards`

CRUD de cartões de crédito.

### 9.3 `useCreditCardInvoiceSync`

Recalcula `current_invoice` após mudanças. Chamado por `useTransactions` em `onSuccess`.

### 9.4 `useCreditCardReconciliation`

Calcula totais para reconciliação: despesas normais vs estornos vs pagamentos. Compara com `current_invoice`.

### 9.5 `useInstallmentGroup`

Busca parcelas de um grupo, edita individual/lote, exclui pendentes, adiciona novas.

### 9.6 `useCategories`

CRUD de categorias com hierarquia.

### 9.7 `useAccounts`

CRUD de contas bancárias.

### 9.8 `useBudgets`

CRUD de orçamentos mensais.

### 9.9 `useCategorizationRules`

CRUD de regras automáticas de categorização.

### 9.10 `useInvestments`

CRUD de ativos e operações. Calcula preço médio ponderado nas compras.

### 9.11 `useInstitutions`

CRUD de instituições financeiras.

### 9.12 `useInvoiceCycles`

Gerencia ciclos de fatura (`credit_card_invoices`).

```typescript
interface UseInvoiceCyclesOptions {
  creditCardId?: string;
  month?: number;
  year?: number;
}

// Retorna:
{
  invoiceCycles,              // Lista de ciclos
  getInvoiceStatus(cardId, month, year),  // "open" | "closed" | "paid"
  isInvoiceClosed(cardId, month, year),   // boolean
  getInvoiceCycle(cardId, month, year),   // InvoiceCycle | undefined
  closeInvoice,               // Mutation
  reopenInvoice,              // Mutation
  markInvoicePaid,            // Mutation
  validateTransactionModification(creditCardId, dueDate),
  checkInvoiceStatusForImport(cardId, dueDate),
}
```

### 9.13 `useActivities`

Log de importações agrupadas por `imported_at`. Permite desfazer importação (deleta todas transações do lote).

```typescript
interface Activity {
  imported_at: string;
  transaction_count: number;
  total_amount: number;
  source_type: "credit_card" | "account";
  source_name: string;
}

// Retorna: activities, undoActivity, isUndoing
```

### 9.14 `useMembers`

Gestão de acesso compartilhado via `shared_access`.

```typescript
interface SharedAccess {
  id: string;
  owner_id: string;
  shared_with_user_id: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

// Retorna: members, addMember (via RPC), revokeAccess
```

### 9.15 `useBankPaymentCandidates`

Busca transações bancárias candidatas para vincular a pagamento de fatura. Janela de busca: 10 dias antes e 5 dias após vencimento. Tolerância de valor: 20%-200%.

```typescript
interface UseBankPaymentCandidatesOptions {
  targetAmount: number;
  dueDate: Date;
  enabled?: boolean;
}
// Retorna: candidates (BankPaymentCandidate[])
```

### 9.16 `useExistingInstallments`

Busca parcelas existentes para deduplicação durante importação. Inclui `detectDuplicates()` (tolerância ±R$ 0.05).

### 9.17 Outros Hooks

- `useInvoiceTransactions` — Transações de uma fatura específica
- `usePendingInstallments` — Parcelas futuras pendentes
- `useCreditCardTransactions` — Transações filtradas por cartão
- `useInvitations` — Convites pendentes
- `useRecurringRules` — CRUD de regras recorrentes (descrição, valor, dia, conta/cartão)
- `useRecurringGenerator` — Gera transações provisórias (`is_provisional: true`) para o mês com base nas regras ativas

---

## 10. Edge Functions

### 10.1 `parse-invoice` (OCR de Faturas)

**Propósito:** Extrair transações de PDF de fatura via Google Gemini 2.5 Pro.

**Input:** `FormData` com `file` (PDF), `creditCardId`  
**Output:** JSON com transações extraídas (data, descrição, valor, parcelas)

O prompt do Gemini instrui a ignorar seções "próximas faturas" para evitar duplicidade.

### 10.2 `migrate-installments`

Migra parcelamentos legados para formato com `installment_group_id`.

### 10.3 `add-member`

Cria usuário (se não existe) + adiciona `shared_access`. Usa `SUPABASE_SERVICE_ROLE_KEY` para criar conta com senha definida pelo admin.

### 10.4 `admin-reset-password`

Reset de senha administrativo via service role. Contorna dependência de emails de recuperação.

---

## 11. Fluxos de Usuário

### 11.1 Importação de Fatura PDF

```
Upload PDF → Edge Function (Gemini OCR) → Post-Processing (ano, parcelas, due_date)
  → Staging Area (InvoiceReviewModal) → Usuário revisa/edita/categoriza
  → Confirma → Cria transações + regras de categorização + parcelas futuras
```

### 11.2 Importação de Extrato Bancário (OFX/CSV)

```
Upload OFX/CSV → Parser local → Detecção de duplicatas → Staging Area
  → Aplicação de regras de categorização → Confirmação → Cria transações
```

### 11.3 Pagamento de Fatura

```
PayInvoiceModal → Split por tipo (corporativo/reembolsável/pessoal)
  → Para cada seção: Cria transação is_card_payment=true
  → Debita conta, Reduz current_invoice → Se zerou: status='paid'
```

### 11.4 Registro de Investimento

```
OperationModal → Se compra: calcula preço médio, atualiza quantity
  → Se venda: calcula lucro realizado → Cria investment_transaction
  → Opcionalmente vincula a transação financeira
```

### 11.5 Fechar/Reabrir Fatura

```
CloseInvoiceModal → Registra closed_amount + closed_at → status='closed'
  → Bloqueia edições no período
ReopenInvoiceModal → Remove closed_at → status='open' → Libera edições
```

### 11.6 Adicionar Membro

```
Settings > MembersSection → Insere email → Edge Function add-member
  → Cria usuário se não existe (com senha definida pelo admin)
  → Adiciona shared_access → Acesso imediato aos dados
```

---

## 12. Troubleshooting

| Problema | Causa | Solução |
|----------|-------|---------|
| Dados não aparecem após importação | Filtro de data errado | Verificar `due_date` vs `date` e mês selecionado |
| Soma da fatura difere do PDF | Tabela "lançamentos futuros" incluída | Verificar parser ignora seções corretas |
| Parcelas não agrupadas | `installment_group_id` vazio | Rodar migração `migrate-installments` |
| Transação em relatório errado | Flags incorretas | Corrigir `is_corporate_expense`, `is_reimbursable`, `is_card_payment` |
| RLS "new row violates policy" | `user_id` undefined | Verificar `user?.id` antes do INSERT |
| `current_invoice` não atualiza | Sync não chamado | Verificar `syncInvoiceForCard` em `onSuccess` |
| Pagamento aparece como despesa | `is_card_payment` não filtrado | Adicionar `!t.is_card_payment` no filtro |
| Fatura bloqueada | Ciclo fechado | Reabrir via `ReopenInvoiceModal` |

---

## 13. Memórias Arquiteturais

### `architecture/security-safeguards`
Auth guards em todas as mutations de INSERT. Verificar `user?.id` antes de qualquer escrita.

### `architecture/code-standards`
Tipos centralizados em `src/types/index.ts`. Constantes de domínio em `src/lib/constants.ts`.

### `architecture/error-handling-standards`
Usar `logError()` ao invés de `console.log()`. Usar `getSafeErrorMessage()` para toasts.

### `architecture/mobile-drawer-interaction-standards`
`data-vaul-no-drag` em áreas roláveis dentro de Drawers. Seletores inline (não Popover/Portal) no mobile para evitar conflitos de foco.

### `features/invoice-balance-sync-logic`
`current_invoice` = Σ(despesas) - Σ(estornos) - Σ(pagamentos). Nunca negativo.

### `features/credit-card-reconciliation-logic`
Compara saldo do banco vs soma de lançamentos. Inclui seção de saldo residual.

### `features/transaction-filtering-rules`
Dashboard usa `due_date` para cartões, `date` para contas. Filtro híbrido implementado.

### `features/installment-management-system`
CRUD completo de parcelas. Sincronização de categoria no grupo.

### `features/due-date-preservation-logic`
Preservar `due_date` original em edições simples. Recalcular apenas se data ou cartão mudar.

### `features/split-payment-flow`
Pagamento de fatura suporta split entre corporativo, reembolsável e pessoal.

### `features/invoice-cycle-management`
Sistema de ciclos com estados open/closed/paid. Fatura fechada bloqueia operações. Modais com persistência de dados (mês/ano capturados no clique).

### `features/member-management-system`
Acesso imediato ao adicionar membro. Edge Function `add-member` cria usuário se necessário. `admin-reset-password` para reset administrativo.

### `architecture/data-integrity-standards`
Transações com `is_card_payment: true` devem ter `credit_card_id` válido.

---

## 14. Armadilhas a Evitar

- [ ] **Excluir `is_card_payment`** dos relatórios de despesas
- [ ] **Não confundir `date` com `due_date`** — Dashboard de cartões usa `due_date`
- [ ] **Hierarquia de categorias** — `parent_id` define subcategorias
- [ ] **RLS e `user_id`** — Sempre incluir `user_id` em INSERTs
- [ ] **Limite de 1000 rows** do Supabase — Usar paginação quando necessário
- [ ] **NÃO usar Popover/Portal dentro de Drawer** no mobile (conflito de foco)
- [ ] **Usar `data-vaul-no-drag`** em áreas roláveis dentro de Drawers
- [ ] **Verificar fatura fechada** antes de criar/editar/excluir transações de cartão
- [ ] **Testar em mobile** — app é mobile-first

---

> **Versão do Documento:** 3.0  
> **Data:** Fevereiro 2026

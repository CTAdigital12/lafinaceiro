

## Plano: Corrigir Cálculo de Pagamento de Fatura (Incluir Reembolsáveis Pessoais)

### Problema Identificado

O hook `useInvoiceTransactions` calcula apenas duas categorias:
- **Corporativo**: `is_corporate_expense = true`
- **Pessoal**: `is_corporate_expense = false`

**Falta considerar**: Os lançamentos marcados como `is_reimbursable = true` (reembolsáveis pessoais) estão sendo somados em "Meu Saldo Devedor", mas o usuário não consegue visualizar esse valor separadamente.

Na prática, os **reembolsáveis pessoais** são valores que o usuário paga do próprio bolso e depois recebe o reembolso. Eles não são "pagos pela empresa" como os corporativos.

### Dados Reais da Fatura (Janeiro/2026)

| Categoria | Valor |
|-----------|-------|
| Corporativos | R$ 28.680,63 |
| Reembolsáveis Pessoais | R$ 1.627,38 |
| Pessoais Normais | R$ 7.700,07 |
| Estornos Pessoais | -R$ 100,54 |
| **Total Débitos** | R$ 38.008,08 |

---

## Alterações Necessárias

### 1. Atualizar Hook `useInvoiceTransactions`

Adicionar o campo `is_reimbursable` na query e calcular três totais:

```text
Estrutura de Retorno Atualizada:
- corporateTotal: soma de is_corporate_expense = true (menos estornos)
- reimbursableTotal: soma de is_reimbursable = true E is_corporate_expense = false
- personalTotal: soma de is_corporate_expense = false E is_reimbursable = false (menos estornos)
```

| Campo | Descrição |
|-------|-----------|
| `corporateTotal` | Gastos 100% pagos pela empresa |
| `reimbursableTotal` | Gastos que o usuário paga e depois recebe reembolso |
| `personalTotal` | Gastos pessoais puros (nunca serão reembolsados) |

---

### 2. Atualizar Interface `PayInvoiceModal`

Modificar a seção "Composição da Fatura" para mostrar três linhas:

```text
┌─────────────────────────────────────────────────────────────────────┐
│  COMPOSIÇÃO DA FATURA                                               │
├─────────────────────────────────────────────────────────────────────┤
│  Total da Fatura:              R$ 40.931,89                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  🏢 Gastos Corporativos:       R$ 28.680,63   [70%]                 │
│  🔄 Compras Reembolsáveis:     R$  1.627,38   [4%]                  │
│  👤 Meus Gastos Pessoais:      R$  7.599,53   [19%]                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  💰 MEU TOTAL A PAGAR:         R$  9.226,91                         │
│     (Reembolsáveis + Pessoais)                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 3. Lógica de Pagamento Atualizada

A seção "Minha Parte" deve incluir automaticamente os reembolsáveis:

| Seção | Cálculo |
|-------|---------|
| Parte Corporativa | `corporateTotal` (empresa paga, sem débito bancário) |
| Minha Parte | `reimbursableTotal + personalTotal` (sai do meu bolso) |

O usuário ainda pode editar os valores manualmente se necessário.

---

### 4. Modal de Revisão de Itens (`InvoiceItemsModal`)

Adicionar ícone/badge visual para diferenciar os três tipos:

| Ícone | Tipo |
|-------|------|
| 🏢 | Corporativo |
| 🔄 | Reembolsável |
| 👤 | Pessoal |

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useInvoiceTransactions.ts` | Adicionar `is_reimbursable` na query e calcular `reimbursableTotal` |
| `src/components/modals/PayInvoiceModal.tsx` | Mostrar três linhas na composição e somar reembolsáveis no "Minha Parte" |
| `src/components/modals/InvoiceItemsModal.tsx` | Adicionar ícone 🔄 para reembolsáveis |

---

## Resumo da Lógica Corrigida

```text
Antes:
  Corporativo = is_corporate_expense = true
  Pessoal = is_corporate_expense = false (TUDO, incluindo reembolsáveis)

Depois:
  Corporativo = is_corporate_expense = true
  Reembolsável = is_reimbursable = true AND is_corporate_expense = false  
  Pessoal = is_reimbursable = false AND is_corporate_expense = false

Meu Total a Pagar = Reembolsável + Pessoal
  (porque ambos saem do meu bolso, só que reembolsável eu recebo depois)
```




# Documentação Completa para Exportação ao Gemini

## Objetivo

Criar/atualizar um arquivo `GEMINI_EXPORT.md` unificado que consolide toda a documentação técnica do sistema, incluindo as correções recentes, para ser exportado e usado como contexto em outras IAs.

---

## Estrutura Proposta

O arquivo será dividido em seções:

### 1. Visão Geral do Sistema
- Stack tecnológico completo
- URL de produção
- Arquitetura geral

### 2. Schema do Banco de Dados
- Todas as 12 tabelas com campos, tipos e descrições
- Relacionamentos entre tabelas
- Explicação detalhada de campos críticos

### 3. Regras de Negócio Implementadas

| Regra | Descrição |
|-------|-----------|
| **date vs due_date** | `date` = data da compra (imutável), `due_date` = competência da fatura |
| **Pagamento de Fatura** | `is_card_payment: true` = transferência, NÃO é despesa |
| **Estornos/Reembolsos** | `is_refund: true` = subtrai do total (fórmula: despesas - estornos) |
| **Gastos Corporativos** | `is_corporate_expense: true` = isolado de relatórios pessoais |
| **Gastos Reembolsáveis** | `is_reimbursable: true` + status de reembolso |
| **Parcelamentos** | Agrupados por `installment_group_id`, numeração sequencial |
| **Inferência de Ano** | Se mês_compra > mês_fatura, ano = ano_fatura - 1 |
| **Sincronização de Saldo** | `current_invoice` recalculado automaticamente |

### 4. Fórmulas de Cálculo Críticas

```typescript
// Total de Despesas (Dashboard/Transações)
normalExpenses = Σ(expense && !is_refund && !is_card_payment)
expenseRefunds = Σ(expense && is_refund)
totalExpense = normalExpenses - expenseRefunds

// Saldo da Fatura do Cartão
current_invoice = Σ(despesas_concluídas) - Σ(estornos) - Σ(pagamentos)

// Reconciliação de Fatura
discrepancy = current_invoice - transactionsTotal
```

### 5. Estrutura de Arquivos Atualizada

```
src/
├── hooks/                    # 19 hooks React Query
│   ├── useTransactions.ts    # CRUD transações
│   ├── useCreditCards.ts     # CRUD cartões + pagamentos
│   ├── useCategories.ts      # CRUD categorias hierárquicas
│   ├── useCreditCardReconciliation.ts  # Lógica de conciliação
│   ├── useCreditCardInvoiceSync.ts     # Sync automático de saldo
│   └── ...
├── pages/                    # 17 páginas
│   ├── Dashboard.tsx         # Resumo financeiro
│   ├── Transactions.tsx      # Lista com 3 abas
│   ├── CreditCards.tsx       # Gestão de cartões
│   └── ...
└── components/
    ├── modals/               # 15+ modais
    ├── dashboard/            # Cards e gráficos
    └── credit-cards/         # Reconciliação
```

### 6. Padrões de Segurança Implementados

```typescript
// OBRIGATÓRIO em todas as mutations de INSERT
if (!user?.id) {
  throw new Error("Usuário não autenticado");
}
const { error } = await supabase
  .from("tabela")
  .insert([{ ...data, user_id: user.id }]);
```

### 7. Fluxos de Importação

#### PDF de Fatura
1. Upload → Edge Function (`parse-invoice`)
2. OCR com Gemini 2.5 Pro
3. Pós-processamento (ano, parcelas)
4. Staging Area para revisão
5. Criação de transações + regras

#### Extrato Bancário (OFX/CSV)
1. Upload → Parser local
2. Detecção de duplicatas
3. Staging Area
4. Aplicação de regras de categorização

### 8. Memórias Arquiteturais

| Memória | Descrição |
|---------|-----------|
| `architecture/security-safeguards` | Auth guards em todas as mutations |
| `features/invoice-balance-sync-logic` | Sincronização automática de `current_invoice` |
| `features/credit-card-reconciliation-logic` | Lógica de conciliação com saldo residual |
| `features/transaction-filtering-rules` | Filtros por `due_date` para cartões |
| `features/installment-management-system` | CRUD completo de parcelas |

### 9. Edge Functions

| Função | Propósito |
|--------|-----------|
| `parse-invoice` | OCR de PDFs via Gemini |
| `migrate-installments` | Migração de parcelamentos legados |

### 10. Troubleshooting

- **Erro RLS "new row violates policy"** → Verificar `user?.id` antes de INSERT
- **Soma de fatura incorreta** → Verificar se estornos estão sendo subtraídos
- **Transações não aparecem** → Verificar filtro `date` vs `due_date`

---

## Arquivo a Criar/Atualizar

| Arquivo | Ação |
|---------|------|
| `GEMINI_EXPORT.md` | Criar novo arquivo consolidado |

---

## Conteúdo Estimado

O arquivo terá aproximadamente **1200-1500 linhas** com:
- Documentação completa do schema
- Todas as regras de negócio
- Fórmulas de cálculo
- Padrões de código
- Fluxos implementados
- Troubleshooting

Isso permitirá que qualquer IA (Gemini, GPT, Claude) entenda completamente o sistema e faça modificações consistentes.


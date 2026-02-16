
# Consolidar toda documentacao em um unico arquivo

## Resumo
Unificar AI_CONTEXT.md, DOCUMENTATION.md e GEMINI_EXPORT.md em um unico arquivo `AI_CONTEXT.md` atualizado para Fevereiro 2026, contendo toda informacao do sistema. Os outros dois arquivos serao removidos.

## Estrutura do documento unificado

O novo `AI_CONTEXT.md` tera a seguinte estrutura, combinando o melhor de cada documento:

```text
1. Visao Geral do Sistema
   - Stack, arquitetura, design system

2. Schema do Banco de Dados (13 tabelas)
   - transactions (com explicacao detalhada de campos criticos)
   - credit_cards (com logica de sync do current_invoice)
   - accounts
   - categories (hierarquia)
   - categorization_rules
   - budgets
   - investment_institutions
   - investment_assets (com pricing_method, current_balance, yield_info, liquidity)
   - investment_transactions (com notes)
   - credit_card_invoices (NOVA - ciclos de fatura)
   - profiles
   - shared_access
   - invitations
   - Diagrama de relacionamentos

3. Regras de Negocio Criticas
   - date vs due_date + inferencia de ano
   - Pagamento de fatura NAO e despesa
   - Estornos/reembolsos
   - Gastos corporativos vs reembolsaveis
   - Parcelamentos (installment_group_id)
   - Sincronizacao automatica de current_invoice
   - Preservacao de due_date em edicoes
   - Ciclos de fatura (fechar/reabrir/pagar)

4. Formulas de Calculo
   - Total de despesas
   - Total de receitas
   - Saldo da fatura
   - Reconciliacao
   - Filtro hibrido (date para contas, due_date para cartoes)
   - Preco medio de investimentos

5. Estrutura de Arquivos
   - Arvore completa e atualizada (incluindo componentes e hooks faltantes)

6. Padroes de Seguranca
   - RLS (com exemplos de shared_access)
   - Auth guards em mutations
   - Tratamento de erros (logError, getSafeErrorMessage)
   - Edge Functions com service role

7. Padroes de Codigo e UI
   - React Query hooks (padrao de uso)
   - Queries Supabase
   - Nomenclatura
   - Estrutura de componente
   - ResponsiveDialog (Dialog desktop / Drawer mobile)
   - Convencoes (datas, moeda, cores, icones)

8. Padroes Mobile (NOVO)
   - data-vaul-no-drag para scroll dentro de Drawers
   - Seletores inline (nao Popover/Portal) dentro de Drawers
   - Bottom Navigation Bar
   - Tabelas convertidas em Cards
   - inputMode="decimal" para valores

9. Hooks e Suas Responsabilidades
   - useTransactions (com options detalhadas)
   - useCreditCards
   - useCreditCardInvoiceSync
   - useCreditCardReconciliation
   - useInstallmentGroup
   - useCategories
   - useAccounts
   - useBudgets
   - useCategorizationRules
   - useInvestments
   - useInstitutions
   - useInvoiceCycles (NOVO)
   - useActivities (NOVO)
   - useMembers (NOVO)
   - useBankPaymentCandidates (NOVO)
   - useExistingInstallments (NOVO)
   - useInvoiceTransactions
   - usePendingInstallments
   - useCreditCardTransactions
   - useInvitations

10. Edge Functions
    - parse-invoice (OCR com Gemini)
    - migrate-installments
    - add-member (NOVO - cria usuario + shared_access)
    - admin-reset-password (NOVO - reset administrativo)

11. Fluxos de Usuario
    - Importacao de fatura PDF (com staging area)
    - Importacao de extrato bancario (OFX/CSV)
    - Pagamento de fatura (split corporativo/reembolsavel/pessoal)
    - Registro de investimento
    - Fechar/Reabrir fatura (NOVO)
    - Adicionar membro (NOVO)

12. Troubleshooting
    - Problemas comuns e solucoes

13. Memorias Arquiteturais
    - Todas as memorias atualizadas incluindo mobile-drawer-interaction-standards
    - invoice-cycle-management
    - member-management-system

14. Armadilhas a Evitar (Checklist)
    - Excluir is_card_payment dos relatorios
    - Nao confundir date com due_date
    - Hierarquia de categorias
    - RLS e user_id
    - Limite de 1000 rows
    - NAO usar Popover/Portal dentro de Drawer no mobile
    - Usar data-vaul-no-drag em areas scrollaveis dentro de Drawers
```

## Secao tecnica

### Arquivos a criar/alterar
1. **`AI_CONTEXT.md`** - Reescrever com todo o conteudo consolidado e atualizado
2. **`DOCUMENTATION.md`** - Remover (conteudo migrado para AI_CONTEXT.md)
3. **`GEMINI_EXPORT.md`** - Remover (conteudo migrado para AI_CONTEXT.md)

### Conteudo novo que sera adicionado (nao existia em nenhum dos 3 docs)

- Tabela `credit_card_invoices` no schema
- Campos adicionais de `investment_assets`: `current_balance`, `pricing_method`, `yield_info`, `liquidity`
- Campo `notes` de `investment_transactions`
- Hook `useInvoiceCycles` com interface e funcoes expostas
- Hook `useActivities` com interface Activity
- Hook `useMembers` com interface SharedAccess
- Hook `useBankPaymentCandidates` com interface e logica de janela de busca
- Hook `useExistingInstallments` com funcao detectDuplicates
- Edge Function `add-member`: cria usuario se nao existe + adiciona shared_access
- Edge Function `admin-reset-password`: reset de senha via service role
- Secao de padroes mobile: `data-vaul-no-drag`, seletores inline, conflito Popover/Portal em Drawers
- Componentes credit-cards faltantes: CloseInvoiceModal, ReopenInvoiceModal, ClosedInvoiceBanner, InvoiceStatusBadge
- Componente `ResponsiveDialog` documentado como padrao de modais
- Pagina Activities.tsx
- Data atualizada para Fevereiro 2026

### Principio
O documento unificado sera a unica fonte de verdade para qualquer IA que trabalhe no projeto. Deve ser completo, preciso e atualizado.

# Exportar Extrato + Conciliação OFX para Contas

## 1. Exportar Extrato (dropdown do card de conta)

Adicionar opção "Exportar Extrato" no menu de 3 pontinhos do `AccountCard`. Ao clicar, gera um arquivo CSV com todas as transações da conta (completed, do mês atual ou todas), com colunas: Data, Descrição, Valor, Tipo, Categoria.

**Arquivo:** `src/pages/Accounts.tsx`

- Adicionar item "Exportar Extrato" no `DropdownMenu`
- Função que busca transações da conta no Supabase, monta CSV ou XLSX e faz download via `Blob`/`URL.createObjectURL`

## 2. Conciliação OFX para Contas Bancárias

Criar um modal de conciliação baseado no `SpreadsheetReconciliationModal` existente, adaptado para contas bancárias com suporte a OFX.

### Novos arquivos:

`**src/components/accounts/AccountReconciliationModal.tsx**`

- Modal que aceita upload de OFX (ou CSV/XLSX)
- Usa `parseOFXWithBalance` para extrair transações do arquivo
- Busca transações do sistema para a conta (filtrando por período do OFX)
- Reutiliza `reconcileSpreadsheet` da lib existente para matching (data + valor)
- Mesma UI de tabs: Conciliados, Divergentes, Apenas Banco, Apenas Sistema
- Ações: Incluir, Excluir, Corrigir valor (idêntico ao credit card)
- Se o OFX tiver saldo (`BALAMT`), mostrar comparação com saldo calculado do sistema e opção de sincronizar `initial_balance`

### Alterações:

`**src/pages/Accounts.tsx**`

- Adicionar item "Conciliar Extrato" no dropdown do card
- State para controlar abertura do modal de conciliação
- Passar account selecionada para o modal

`**src/lib/spreadsheetReconciliation.ts**`

- Sem alterações — a lógica de matching já é genérica (data + valor com tolerância)

### Fluxo do usuário:

1. Clica nos 3 pontinhos → "Conciliar Extrato"
2. Faz upload do OFX (ou CSV/XLSX)
3. Vê resultado da conciliação em tabs
4. Pode incluir transações faltantes, excluir extras, corrigir valores
5. Se o OFX tiver saldo do banco, pode sincronizar o saldo

### Seção técnica

- Para buscar transações do sistema, o modal detecta o range de datas do arquivo OFX (min/max date das transações) e filtra `transactions` por `account_id` + `date` dentro desse range
- As transações do OFX são convertidas para `SpreadsheetItem[]` para reutilizar `reconcileSpreadsheet`
- Para incluir novas transações, usa `createTransaction` do `useTransactions` com `account_id` preenchido e `credit_card_id = null`
- O saldo OFX é comparado com `computed_balance` da conta; sincronização ajusta `initial_balance = bankBalance - realized_net`
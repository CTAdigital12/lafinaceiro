

# Conciliação por Planilha de Fatura do Cartão

## Contexto

O sistema já possui uma conciliação que compara o total do banco vs. total de lançamentos. A nova funcionalidade permite o upload de uma planilha (CSV/XLSX) com **todos os lançamentos individuais** da fatura do banco, comparando item a item com os lançamentos registrados no sistema.

## Fluxo do Usuário

1. Na tela de Cartões, na seção de Conciliação, o usuário clica em **"Conciliar com Planilha"** no card de um cartão específico
2. Abre um modal para upload da planilha (CSV ou XLSX) com seleção de mês/ano
3. O sistema faz o parsing e compara cada linha da planilha com as transações existentes no banco de dados para aquele cartão/mês
4. Exibe uma tabela de resultados com 3 categorias:
   - **Conciliado** (match exato): item da planilha encontrado no sistema
   - **Apenas no Banco** (faltando no sistema): item na planilha sem correspondente - pode ser incluído
   - **Apenas no Sistema** (sobrando): lançamento no sistema sem correspondente na planilha - pode ser excluído ou revisado
   - **Divergência de Valor**: match por descrição/data mas com valor diferente - sinalizado para correção
5. O usuário pode agir em cada item: incluir, excluir, corrigir ou ignorar

## Arquivos e Mudanças

### 1. Novo componente: `src/components/credit-cards/SpreadsheetReconciliationModal.tsx`

Modal principal com:
- Upload de arquivo (CSV/XLSX) - reutiliza o `xlsx` package já instalado
- Seletor de mês/ano (pré-preenchido com o mês atual da reconciliação)
- Tabela de resultados com tabs: "Todos", "Conciliados", "Apenas Banco", "Apenas Sistema", "Divergentes"
- Cada linha mostra: data, descrição, valor planilha, valor sistema, status (badge colorido)
- Ações por item: botão para incluir transação faltante, excluir transação extra, ou corrigir valor

### 2. Nova lógica de matching: `src/lib/spreadsheetReconciliation.ts`

Função que recebe a lista da planilha e a lista do sistema e retorna o matching:
- Reutiliza `normalizeString` e `normalizeDate` de `src/lib/deduplication.ts`
- Algoritmo de matching em 2 passes:
  - **Pass 1 (Exato)**: match por descrição normalizada + data + valor (tolerância ±0.05)
  - **Pass 2 (Parcial)**: itens não matched - tenta match por descrição+data (ignora valor) para detectar divergências de valor
- Itens restantes são classificados como "apenas banco" ou "apenas sistema"

### 3. Parser de planilha: reutilizar `csvInvoiceParser.ts` para CSV + adicionar suporte XLSX

Usar o pacote `xlsx` já instalado para ler arquivos XLSX. Extrair colunas: data, descrição, valor. Mesmo formato de saída do CSV parser.

### 4. Integração no `ReconciliationCard.tsx`

Adicionar botão "Conciliar com Planilha" (ícone Upload) ao lado de cada cartão na seção de conciliação. Ao clicar, abre o `SpreadsheetReconciliationModal` passando `creditCardId`, `month`, `year`.

### 5. Ações do modal

- **Incluir** item faltante: abre o `TransactionModal` pré-preenchido com os dados da planilha
- **Excluir** item extra: confirmação + delete da transação
- **Corrigir** valor divergente: atualiza o `amount` da transação existente via `useTransactions.updateTransaction`

### 6. Query de transações existentes

Buscar transações do cartão/mês usando `due_date` (mesmo critério da reconciliação atual), incluindo `original_description` para matching robusto.

## Seção Técnica

### Estrutura do matching

```text
Planilha (banco)          Sistema (transactions)
─────────────────         ─────────────────────
item A ──────────────────── tx A  → CONCILIADO
item B ─── valor diff ────── tx B  → DIVERGÊNCIA (R$50 vs R$55)
item C ──── sem match ──────        → APENAS NO BANCO
                                tx D  → APENAS NO SISTEMA
```

### Interface de resultado

```typescript
interface ReconciliationResult {
  matched: Array<{ spreadsheet: SpreadsheetItem; transaction: DbTransaction; }>;
  valueDiscrepancies: Array<{ spreadsheet: SpreadsheetItem; transaction: DbTransaction; difference: number; }>;
  onlyInSpreadsheet: SpreadsheetItem[];
  onlyInSystem: DbTransaction[];
  summary: { total: number; matched: number; discrepancies: number; missing: number; extra: number; };
}
```

Nenhuma migração de banco necessária — usa as tabelas e colunas existentes (incluindo `original_description`).


# Deduplicacao Robusta com `original_description`

## Resumo

Adicionar coluna `original_description` na tabela `transactions` para preservar o texto cru do parser, e refatorar a logica de deduplicacao para ser resiliente a renomeacoes, problemas de fuso horario e espacos do OCR.

## Mudancas

### 1. Migracao de banco de dados

```sql
ALTER TABLE public.transactions ADD COLUMN original_description text;
```

Coluna nullable, sem impacto em registros existentes.

### 2. Funcao utilitaria `normalizeString`

**Novo arquivo: `src/lib/deduplication.ts**`

Centraliza toda a logica de normalizacao e deteccao de duplicatas:

- `normalizeString(str)`: lowercase, remove acentos (`normalize("NFD").replace diacritics`), colapsa espacos multiplos, trim
- `normalizeDate(date)`: converte qualquer formato para string `YYYY-MM-DD`, sem depender de objetos Date
- `detectDuplicates()` refatorado com as 4 regras:
  1. **Data**: comparacao de strings `YYYY-MM-DD`
  2. **Valor**: tolerancia `Math.abs(a - b) <= 0.05`
  3. **String**: compara importado normalizado com `original_description` normalizado do banco (fallback para `description`)
  4. **Parcela**: se importado tem `installment_current`, exige match de `installment_number` e `total_installments`

### 3. Hook `useExistingInstallments`

**Arquivo: `src/hooks/useExistingInstallments.ts**`

- Adicionar `original_description` ao `.select()` da query
- Atualizar interface `ExistingInstallment` com campo `original_description: string | null`
- Substituir a funcao `detectDuplicates` local pelo import de `src/lib/deduplication.ts`

### 4. Salvamento com `original_description`

**Arquivo: `src/components/modals/InvoiceReviewModal.tsx**`

No `handleImport`, ao montar cada transacao:

- `description` = texto editado pelo usuario (pode ter sido renomeado na review ou posteriormente)
- `original_description` = `item.description` original do parser (valor que veio do PDF/CSV antes de qualquer edicao)

Mesma logica para parcelas futuras geradas.

**Arquivo: `src/components/modals/AccountReviewModal.tsx**`

Mesmo padrao: guardar a descricao original do OFX/CSV em `original_description`, e a descricao editada em `description`.

Precisamos rastrear a descricao original. Adicionar campo `original_description` no `ReviewItem` de ambos os modais, populado na inicializacao com `item.description` antes de qualquer edicao.

### 5. `useTransactions` - createTransaction

**Arquivo: `src/hooks/useTransactions.ts**`

Adicionar `original_description` como campo opcional na mutation `createTransaction`. Incluir no insert do Supabase.

### 6. Deduplicacao no AccountReviewModal

**Arquivo: `src/components/modals/AccountReviewModal.tsx**`

Atualizar a query de duplicatas para buscar `original_description` tambem. Usar `normalizeString` e `normalizeDate` do novo utilitario em vez da logica atual (que usa substring de 10 chars, fragil).

### 7. UI - Indicadores visuais (ja existentes, sem mudanca significativa)

A InvoiceReviewModal ja marca duplicatas com badge amarelo "Ja Lancado" e checkbox desmarcado. A AccountReviewModal ja tem indicadores. Nenhuma mudanca de UI necessaria alem de garantir consistencia.

## Arquivos afetados

1. **Migracao SQL** - nova coluna `original_description`
2. `src/lib/deduplication.ts` - novo arquivo com `normalizeString`, `normalizeDate`, `detectDuplicates`
3. `src/hooks/useExistingInstallments.ts` - buscar `original_description`, usar novo `detectDuplicates`
4. `src/hooks/useTransactions.ts` - aceitar `original_description` no create
5. `src/components/modals/InvoiceReviewModal.tsx` - salvar `original_description`, rastrear descricao original
6. `src/components/modals/AccountReviewModal.tsx` - salvar `original_description`, usar nova deduplicacao
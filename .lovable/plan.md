

# Correção de erros e performance em atualizações em massa

## Problema 1: Erro "Cannot coerce the result to a single JSON object"

A mutation `updateTransaction` no hook `useTransactions.ts` usa `.select().single()` após o update. Quando a query de update não retorna exatamente 1 registro (pode acontecer por timing ou RLS), o Supabase lança esse erro. A correção é trocar `.single()` por `.maybeSingle()`.

## Problema 2: Atualizações em massa lentas (uma por uma)

As funções de bulk no `Transactions.tsx` (`handleBulkCorporateToggle`, `handleBulkCategoryUpdate`, `handleBulkDelete`) fazem um loop sequencial com `await` para cada transação. Com 100 lançamentos, são 100 requests HTTP sequenciais.

A solução é fazer uma única query SQL para atualizar todos os registros de uma vez, usando `.in("id", ids)`.

## Alterações

### 1. `src/hooks/useTransactions.ts` - Corrigir `.single()`

Na mutation `updateTransaction`, trocar `.select().single()` por `.select().maybeSingle()` para evitar o erro quando o resultado não pode ser convertido em um único objeto JSON.

### 2. `src/pages/Transactions.tsx` - Bulk updates com query única

Substituir os loops sequenciais por operações batch:

- **`handleBulkCorporateToggle`**: Uma única chamada `supabase.from("transactions").update({ is_corporate_expense }).in("id", selectedTransactions)` em vez de N chamadas individuais.

- **`handleBulkCategoryUpdate`**: Uma única chamada `supabase.from("transactions").update({ category_id }).in("id", selectedTransactions)` em vez de N chamadas individuais.

- **`handleBulkDelete`**: Uma única chamada `supabase.from("transactions").delete().in("id", selectedTransactions)` em vez de N chamadas individuais.

Após cada operação batch, invalidar as queries de transactions e accounts manualmente (já que não passam pela mutation do hook).

### Detalhes técnicos

**Antes (lento):**
```typescript
for (const id of selectedTransactions) {
  await updateTransaction.mutateAsync({ id, is_corporate_expense: true });
}
```

**Depois (rápido):**
```typescript
const { error } = await supabase
  .from("transactions")
  .update({ is_corporate_expense: true })
  .in("id", selectedTransactions);

if (error) throw error;
queryClient.invalidateQueries({ queryKey: ["transactions"] });
```

Isso reduz de N requests para 1 request, independente da quantidade de transações selecionadas.


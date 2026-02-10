

# Correção: Erro ao Importar Fatura (RLS em categorization_rules)

## Problema

O erro `"new row violates row-level security policy for table categorization_rules"` ocorre durante a criação de regras de categorização no fluxo de importação de fatura.

Na função `handleImport` do `InvoiceReviewModal.tsx` (linha 418-424), a criação de regras acontece **antes** da criação das transações e dentro do mesmo bloco `try/catch`:

```typescript
// Linha 418-424 - se falha aqui, toda a importação é abortada
for (const rule of rulesToCreate) {
  if (!seenKeywords.has(rule.keyword)) {
    seenKeywords.add(rule.keyword);
    await createRule.mutateAsync(rule);  // ERRO AQUI -> mata tudo
  }
}
```

Quando a criação de qualquer regra falha, o erro propaga para o `catch` da linha 574 e **toda a importação é abortada** -- nenhuma transação é criada.

## Causa Raiz

O `upsert` com `onConflict: 'user_id,keyword'` no hook `useCategorizationRules.ts` pode falhar quando:
- Uma regra com a mesma keyword já existe mas o PostgreSQL RLS bloqueia o UPDATE implícito do upsert
- Ou quando há alguma inconsistência no contexto de autenticação

## Solucao

Tornar a criação de regras **tolerante a falhas** -- se uma regra não puder ser criada, a importação das transações deve continuar normalmente.

### Arquivo: `src/components/modals/InvoiceReviewModal.tsx`

**Modificar linhas 418-424** -- envolver cada criação de regra em seu próprio try/catch:

```typescript
const seenKeywords = new Set<string>();
let rulesCreated = 0;
for (const rule of rulesToCreate) {
  if (!seenKeywords.has(rule.keyword)) {
    seenKeywords.add(rule.keyword);
    try {
      await createRule.mutateAsync(rule);
      rulesCreated++;
    } catch (ruleError) {
      console.warn("Falha ao criar regra para:", rule.keyword, ruleError);
      // Continuar com a importação mesmo se a regra falhar
    }
  }
}
```

E atualizar a referência na mensagem de sucesso (linha 563) para usar `rulesCreated` ao invés de `rulesToCreate.length`.

### Resumo

Apenas 1 arquivo precisa ser modificado. A mudanca e pequena: envolver a criacao de regras em try/catch individual para que falhas nao bloqueiem a importacao das transacoes.


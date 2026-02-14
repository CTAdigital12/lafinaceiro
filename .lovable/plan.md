

# Corrigir perda de dados de parcelas ao editar transacao

## Problema
Quando voce edita uma transacao que faz parte de um grupo de parcelas (pelo modal de transacao normal), o sistema **apaga** os campos `installment_group_id`, `installment_number` e `total_installments`, pois o codigo sempre envia esses valores como `null` (linhas 296-298 do TransactionModal.tsx).

Isso faz com que:
- A parcela editada perca o vinculo com o grupo
- A categoria e descricao nao sejam propagadas para as outras parcelas do grupo
- As parcelas de marco (e outros meses) aparecam sem categoria e com descricao desatualizada

## Causa raiz
No `TransactionModal.tsx`, ao montar o objeto `transactionData` para edicao, o codigo forca:
```
installment_group_id: null,
installment_number: null,
total_installments: null,
```

Deveria preservar os valores originais quando a transacao ja pertence a um grupo.

## Solucao

### 1. Preservar campos de parcela ao editar (`TransactionModal.tsx`)
- Quando editando uma transacao existente, manter os valores originais de `installment_group_id`, `installment_number` e `total_installments` em vez de forcar `null`
- Trocar as 3 linhas para usar os valores do `transaction` original:

```
installment_group_id: isEditing && transaction ? transaction.installment_group_id : null,
installment_number: isEditing && transaction ? transaction.installment_number : null,
total_installments: isEditing && transaction ? transaction.total_installments : null,
```

### 2. Propagar categoria para o grupo ao editar parcela (`TransactionModal.tsx`)
- Apos o `updateTransaction`, verificar se a transacao pertence a um grupo (`installment_group_id` nao nulo) e se a categoria mudou
- Se sim, atualizar a categoria de todas as parcelas do grupo (mesma logica do `updateCategoryForAll` no `useInstallmentGroup`)

Trecho a adicionar apos a linha 302 (`await updateTransaction.mutateAsync(...)`) :

```
// Sync category to all installments in the group
if (isEditing && transaction?.installment_group_id && categoryId !== transaction.category_id) {
  await supabase
    .from("transactions")
    .update({ category_id: categoryId || null })
    .eq("installment_group_id", transaction.installment_group_id);
}
```

## Resultado esperado
- Editar uma parcela preserva o vinculo com o grupo
- Alterar a categoria de uma parcela propaga para todas as parcelas do grupo
- As parcelas de marco (e demais meses) manterao categoria e descricao corretas

## Secao tecnica
- Arquivo principal: `src/components/modals/TransactionModal.tsx`
- Linhas afetadas: 296-298 (preservar campos) e 301-302 (propagar categoria)
- Nenhuma alteracao em banco de dados necessaria


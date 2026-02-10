
# Correção: Parcelas pendentes não contabilizadas na conciliação

## Problema

O valor da fatura é **R$ 63.252,12**, mas a conciliação mostra apenas **R$ 61.428,85**. A diferença de **R$ 1.823,27** corresponde exatamente a **17 transações com status "pending"**.

Essas transações são parcelas futuras geradas automaticamente durante uma importação anterior (ex: ao importar a fatura de janeiro com parcela 2/10, o sistema criou a parcela 3/10 para fevereiro com status "pending"). Quando o usuário importa a fatura de fevereiro, o sistema detecta essas parcelas como duplicatas e o usuário as desmarca. Porém, elas **nunca são atualizadas de "pending" para "completed"**, e a conciliação só conta transações "completed".

## Solução

Quando itens duplicados são detectados e desmarcados da importação, o sistema deve **automaticamente atualizar o status das parcelas pendentes correspondentes para "completed"**. Isso garante que ao confirmar a importação, as parcelas que já existiam como "pending" sejam reconhecidas como parte da fatura atual.

## Arquivos a modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/modals/InvoiceReviewModal.tsx` | Ao confirmar a importação, atualizar para "completed" todas as parcelas pendentes que foram detectadas como duplicatas |

## Mudança específica

### `src/components/modals/InvoiceReviewModal.tsx` - função de confirmação da importação

Após a inserção das novas transações, adicionar um passo que:

1. Coleta os IDs das transações existentes que foram detectadas como duplicatas (do `duplicateMap`)
2. Atualiza o status dessas transações de `"pending"` para `"completed"` no banco de dados
3. Isso acontece automaticamente sem intervenção do usuário

```typescript
// Após inserir novas transações, ativar parcelas pendentes duplicadas
const pendingIdsToActivate = Array.from(duplicateMap.values())
  .map(existing => existing.id);

if (pendingIdsToActivate.length > 0) {
  await supabase
    .from("transactions")
    .update({ status: "completed" })
    .in("id", pendingIdsToActivate)
    .eq("status", "pending");
}
```

## Seção Técnica

**Fluxo atual:**
1. Importação de janeiro: parcela 2/10 importada como "completed", parcela 3/10 gerada como "pending"
2. Importação de fevereiro: sistema detecta parcela 3/10 como duplicata, usuario desmarca
3. Parcela 3/10 permanece "pending" -- nao contabilizada na conciliacao

**Fluxo corrigido:**
1. Importação de janeiro: mesmo comportamento
2. Importação de fevereiro: sistema detecta parcela 3/10 como duplicata, usuário desmarca
3. Ao confirmar importação, parcela 3/10 é atualizada para "completed" -- contabilizada corretamente

**Impacto:** Apenas parcelas previamente geradas como futuras serao afetadas. Transações manuais ou importadas diretamente nao sao impactadas pois ja possuem status "completed".



# Fix: Dialog "Conciliar" mostrando lista vazia

## Diagnóstico

O dialog de conciliação manual só mostra itens de `result.onlyInSpreadsheet` (itens que existem apenas no banco). Porém, o item "sisdeb porto seguro" de R$ 231,02 no dia 02/03 já foi **pareado automaticamente** com outra transação do sistema (provavelmente a transação "completed" correspondente), então ele não aparece em `onlyInSpreadsheet` — ele está em `result.matched`.

O "Seguro Apartamento 1/4" (pending/installment) ficou órfão em `onlyInSystem`, e ao clicar "Conciliar", o dialog mostra a lista vazia.

## Solução

**Arquivo:** `src/components/accounts/AccountReconciliationModal.tsx`

Mudar o dialog de conciliação para mostrar **todos os itens do extrato bancário** (matched + discrepancies + onlyInSpreadsheet), não apenas os não-pareados. Isso permite ao usuário:

1. Selecionar um item que já foi pareado com outra transação
2. Ao confirmar, o sistema **desfaz o match anterior** (a transação que estava pareada volta para `onlyInSystem`) e **aplica o novo match** (atualiza a transação pendente com os dados do banco)

### Mudanças específicas:

1. Criar uma lista `allSpreadsheetItems` que agrega todos os itens do extrato (já existe parcialmente no código como `allBankItems`, linha ~155-165)
2. No dialog de conciliação (linha ~532), usar essa lista completa ao invés de `result.onlyInSpreadsheet`
3. Adicionar indicador visual para itens já pareados (ex: "(já pareado)") para que o usuário saiba que está re-atribuindo
4. Na função `handleReconcileProvisional`, se o item selecionado já estava pareado com outra transação, reverter aquele match (a outra transação não precisa de update no DB, apenas o re-run da reconciliação resolve)


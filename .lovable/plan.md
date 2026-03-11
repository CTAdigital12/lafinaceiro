

# Simplificar Conciliação: Apenas Data + Valor

## Problema

A lógica atual exige match de **descrição + data + valor**, mas as descrições entre planilha do banco e sistema quase nunca batem (nomes diferentes, abreviações, etc). O usuário quer que o matching use apenas **data + valor**.

## Mudança

### `src/lib/spreadsheetReconciliation.ts` — função `reconcileSpreadsheet`

**Pass 1 (match exato):** Comparar apenas `date` + `amount` (tolerância ±0.05). Remover comparação de descrição.

**Pass 2 (divergência de valor):** Comparar apenas `date`, e se o valor for diferente, marcar como divergência. Remover comparação de descrição.

Isso significa que para cada item da planilha, o sistema procura uma transação com a mesma data e mesmo valor. Se encontrar, é "Conciliado". Se encontrar mesma data mas valor diferente, é "Divergência". Se não encontrar nada, é "Apenas no Banco".

**Nota:** Quando houver múltiplas transações na mesma data, o matching será feito 1-a-1 (primeiro match encontrado é consumido), o que é o comportamento correto para evitar duplicação.


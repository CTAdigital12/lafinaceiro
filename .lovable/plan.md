

# Melhorias na Conciliação com Planilha

## Problemas

1. **Valores positivos/negativos**: O parser converte tudo para `Math.abs()`, perdendo a informacao de extorno. O usuario precisa poder marcar um item como extorno antes de incluir.
2. **Sem barra de rolagem**: O `ScrollArea` nao tem altura fixa definida, entao nao gera scroll.
3. **Divergencias sem acoes completas**: Divergencias so tem "Corrigir" (altera valor no sistema). Faltam "Ignorar" e "Incluir".

## Mudancas

### 1. Botao de extorno nos itens "Apenas Banco" e "Divergentes"

No `ResultTable`, adicionar um botao toggle (icone RotateCcw) ao lado de cada item da planilha que permite marcar/desmarcar como extorno. Quando marcado, o item entra como `is_refund: true` e `type: "income"` ao clicar "Incluir".

- Adicionar state `refundItems: Set<number>` (por `rowIndex`) no modal principal
- Passar para `ResultTable` e renderizar toggle antes do botao de acao
- No `handleAddTransaction`, checar se o item esta no set de extornos e ajustar `is_refund` e `type`

### 2. Altura fixa no ScrollArea

Linha 317: `<ScrollArea className="flex-1 min-h-0 mt-3">` nao funciona bem dentro de dialogs flexbox. Trocar para altura fixa calculada:

```
<ScrollArea className="flex-1 min-h-0 mt-3" style={{ maxHeight: "calc(90vh - 280px)" }}>
```

### 3. Acoes completas para divergencias

Atualmente divergencias so tem "Corrigir" (ajusta valor no sistema para o da planilha). Adicionar:

- **Ignorar**: Remove o item da lista visualmente (adiciona ao set `ignoredKeys`)
- **Incluir**: Mesma logica do "Apenas Banco" — cria nova transacao com o valor da planilha (o item do sistema continua existindo)

State `ignoredKeys: Set<string>` no modal. Filtrar rows ignoradas no `ResultTable`.

### Arquivo: `src/components/credit-cards/SpreadsheetReconciliationModal.tsx`

- Adicionar states: `refundItems` (Set de rowIndex), `ignoredKeys` (Set de string)
- Passar ambos como props para `ResultTable`
- Na coluna de acao das divergencias: renderizar 3 botoes (Corrigir | Incluir | Ignorar)
- Na coluna de acao dos "missing": renderizar toggle extorno + Incluir
- No `handleAddTransaction`: verificar `refundItems.has(item.rowIndex)` para definir `is_refund: true` e `type: "income"`
- Ajustar `ScrollArea` com `maxHeight` para garantir scroll


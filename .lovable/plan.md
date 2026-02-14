

# Mostrar opcao "Despesa da Empresa" tambem para receitas

## Problema
O switch "Despesa da Empresa" no modal de transacao so aparece quando o tipo e `expense`. Para registrar o PIX de reembolso corporativo como receita sem inflar os totais, o usuario precisa marcar `is_corporate_expense` na receita, mas a opcao nao esta visivel.

## Solucao
Remover a condicao `type === "expense"` que esconde o switch, permitindo que receitas tambem sejam marcadas como corporativas. Ajustar o label para ficar coerente nos dois contextos.

## Alteracao

### `src/components/modals/TransactionModal.tsx`
- Linha ~737: remover a condicao `{type === "expense" && (` que envolve o bloco do switch corporativo
- Alterar o label de "Despesa da Empresa" para "Transacao Corporativa" (ou manter "Despesa da Empresa" e adicionar um subtitulo contextual)
- O switch ficara visivel tanto para receitas quanto para despesas

Trecho atual (simplificado):
```text
{type === "expense" && (
  <div> ... Switch "Despesa da Empresa" ... </div>
)}
```

Trecho novo:
```text
<div> ... Switch "Transacao Corporativa" ... </div>
```

Sem a condicao de tipo, o switch aparece sempre. Nenhuma outra alteracao e necessaria -- os filtros de totais ja foram atualizados para excluir `is_corporate_expense` tanto de receitas quanto de despesas.

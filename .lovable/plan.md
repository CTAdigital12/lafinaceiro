

# Fix: Ícone Extorno deve marcar transação como extorno diretamente

## Problema

Ao clicar no ícone de extorno (RotateCcw) na lista de transações, o sistema abre um modal para **criar uma nova transação de extorno**, em vez de simplesmente marcar a transação existente como extorno. O usuário espera que o clique no ícone **alterne o flag `is_refund`** da transação, fazendo o valor mudar de negativo (despesa) para positivo (extorno) imediatamente.

## Solução

Mudar o comportamento do botão de extorno em `src/pages/Transactions.tsx`:

- Em vez de chamar `handleCreateRefund(transaction)` (que abre modal para nova transação), chamar `updateTransaction.mutate({ id: transaction.id, is_refund: true })` diretamente
- Isso marca a transação existente como extorno, fazendo o valor aparecer como positivo na listagem
- Manter o botão visível apenas quando `!transaction.is_refund` (como já está)
- Aplicar a mesma mudança na versão mobile da lista de transações (se houver o mesmo botão)

### Arquivo: `src/pages/Transactions.tsx`

1. Substituir `onClick={() => handleCreateRefund(transaction)}` por uma chamada direta ao `updateTransaction.mutate({ id: transaction.id, is_refund: true })`
2. Verificar se existe o mesmo botão na versão mobile da listagem e aplicar a mesma correção
3. A função `handleCreateRefund` e o state `refundingTransaction` podem ser mantidos caso sejam usados em outro lugar, ou removidos se ficarem órfãos


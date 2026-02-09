

# Correção: Seletor de Mês e Dados Zerados nos Cartões

## Diagnóstico

### Problema 1: Seletor de mês "não funciona" (Fevereiro)

O seletor está DENTRO do componente `ReconciliationCard`. Quando não há dados visíveis, o componente inteiro retorna `null` (linha ~217 do ReconciliationCard), fazendo o seletor de mês desaparecer junto.

Para Fevereiro/2026, todas as 17 transações de cartão têm `status: "pending"`. O hook de reconciliação só conta transações "completed" no `transactionsTotal`. Como resultado:
- `bankInvoice = 0` (current_invoice do cartão é 0)
- `transactionsTotal = 0` (nenhuma transação "completed" em fev)
- `hasData = false` -> componente retorna `null` -> seletor some

### Problema 2: Janeiro mostra tudo zerado

Janeiro tem 162 transações "completed" totalizando R$ 40.935,36 no banco. O `transactionsTotal` deveria estar correto. Porém:
- `bankInvoice = 0` porque usa `card.current_invoice` que é o saldo ATUAL do cartão (já está pago), não o valor histórico daquele mês
- Os cards de resumo no topo da página ("Fatura Banco") usam `totalInvoice` do hook `useCreditCards`, que é o saldo atual e não muda com o mês selecionado

## Solução

### 1. Sempre exibir o ReconciliationCard (com seletor de mês)

Remover a condição `if (!hasData) return null`. Quando não houver dados, mostrar uma mensagem informativa ao invés de esconder o componente inteiro.

### 2. Incluir transações pendentes no cálculo de visibilidade

Modificar a verificação `hasData` para considerar também `pendingTotal`:
```typescript
const hasData = reconciliation.cards.some(
  c => c.bankInvoice > 0 || c.transactionsTotal > 0 || c.pendingTotal > 0
);
```

### 3. Sincronizar os cards de resumo com o mês selecionado

Os 5 cards de resumo no topo da página CreditCards.tsx devem usar os dados de `reconciliation` (que já acompanha o mês) ao invés de `totalInvoice` do `useCreditCards`.

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/credit-cards/ReconciliationCard.tsx` | Sempre exibir o componente; incluir pendingTotal na verificação hasData; mostrar mensagem quando não há transações |
| `src/pages/CreditCards.tsx` | Sincronizar card "Fatura Banco" com o mês selecionado (usar reconciliation.totalBankInvoice que já acompanha o período) |

## Mudanças Específicas

### ReconciliationCard.tsx

**Condição hasData (linha ~217)**: Ao invés de retornar null, sempre renderizar o card com o seletor de mês. Quando não houver dados, exibir mensagem dentro do card:

```tsx
const hasData = reconciliation.cards.some(
  c => c.bankInvoice > 0 || c.transactionsTotal > 0 || c.pendingTotal > 0
);

// Remover: if (!hasData) return null;

// No JSX, envolver a seção de detalhes com:
{hasData ? (
  // ... conteúdo existente (summary cards, card details, etc)
) : (
  <div className="text-center py-6 text-muted-foreground">
    <p>Nenhum lançamento encontrado para este período.</p>
  </div>
)}
```

O header com o seletor de mês ficará FORA desta condição, sempre visível.

### CreditCards.tsx

**Card "Fatura Banco" (linhas 248-253)**: O valor já usa `totalInvoice` do `useCreditCards`, que reflete o saldo atual. Isso é correto para mostrar o saldo atual do banco. Porém, vale verificar que os outros cards (Fatura Lançada, Meu Custo, A Reembolsar) já usam `reconciliation.*` que acompanha o mês -- e estes já estão corretos.

O foco principal é garantir que o ReconciliationCard (e seu seletor de mês) esteja sempre visível.

---

### Seção Técnica

**Causa raiz principal**: A verificação `hasData` no ReconciliationCard esconde o componente inteiro (incluindo o seletor de mês) quando:
- Todas transações são "pending" (fevereiro)
- O `current_invoice` do cartão é 0 (já pago)

**Impacto**: O seletor de mês é renderizado dentro do componente que desaparece, tornando impossível navegar para meses com dados.

**Correção**: Separar a renderização do header (sempre visível) do conteúdo de dados (condicional), e ampliar a verificação de `hasData` para incluir pendentes.


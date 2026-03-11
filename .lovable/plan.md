

# Correção: Botão "Conciliar" e saldo divergente

## Diagnóstico

### 1. Botão "Conciliar" não aparece
A transação "Seguro Apartamento 1/4" tem `is_provisional: false` e `status: "pending"` no banco de dados. O botão "Conciliar" só aparece quando `is_provisional === true` (linha 715 do modal). Como essa transação é uma **parcela** (installment), não uma recorrência, ela nunca foi marcada como provisional — mas é igualmente uma previsão que deveria ser conciliável.

### 2. Saldo divergente
O `computed_balance` em `useAccounts.ts` só soma transações `completed` e `!is_provisional`. A transação "Seguro Apartamento 1/4" com `status: "pending"` não entra no saldo computado, o que está correto. A divergência de R$ 512 provavelmente já existia antes — preciso verificar se algo foi alterado na lógica de saldo, mas pelo código atual o cálculo parece inalterado.

## Solução

### Arquivo: `src/components/accounts/AccountReconciliationModal.tsx`

**Expandir a condição do botão "Conciliar"** (linha 715):

```typescript
// Antes:
{row.systemTx.is_provisional && (

// Depois:
{(row.systemTx.is_provisional || row.systemTx.status === "pending") && (
```

Isso permite conciliar tanto transações provisórias (recorrências) quanto pendentes (parcelas futuras) com itens do extrato bancário.

**Na ação de conciliação** (`handleReconcileProvisional`), já atualiza `status: "completed"` e `is_provisional: false`, o que é correto para ambos os casos.

### Verificação do saldo

Vou confirmar que nenhuma alteração foi feita na lógica de `useAccounts.ts` que pudesse ter mudado o cálculo do saldo. Se o saldo já estava correto antes e agora diverge, pode ser efeito da exclusão das 2 transações duplicadas feita anteriormente (que reduziu o saldo do sistema).


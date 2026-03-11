

# Excluir Lançamentos Futuros/Pendentes do Saldo

## Problema

O saldo exibido (-442,84) inclui parcelas pendentes e futuras (como as 4 parcelas do Seguro Apartamento). O campo `current_balance` na tabela `accounts` é atualizado incrementalmente durante importações e pagamentos, mas o valor armazenado já acumulou transações que não deveriam contar.

**Dados atuais da conta:**
- `current_balance` armazenado: -442,84
- Soma de todas as transações: -2.236,28
- Soma apenas completed + passado: -1.312,20
- Soma pending/futuras: -924,08

## Solução

Ao invés de confiar no campo `current_balance` armazenado (que acumula drift), calcular o saldo dinamicamente a partir das transações, excluindo:
- Transações com `status = 'pending'`
- Transações com `is_provisional = true`
- Transações com `date > hoje`

### Arquivos alterados

**1. `src/hooks/useAccounts.ts`**
- Adicionar uma query separada que calcula o saldo real de cada conta somando transações completed, não-provisórias, com data <= hoje
- Substituir `account.current_balance` pelo saldo calculado no retorno
- `totalBalance` será a soma dos saldos calculados
- Manter o campo `current_balance` do banco como fallback (contas sem transações usam o valor armazenado)

**2. `src/pages/Dashboard.tsx`**
- Remover a lógica de `projectedBalance` / `provisionalAccountExpenses` que já não será necessária, pois o saldo já exclui pendentes
- Simplificar o subtitle do card de Saldo

**3. `src/pages/Accounts.tsx`**
- Usar o saldo calculado (já virá do hook atualizado)

### Seção Técnica

A query para calcular o saldo real por conta:

```sql
SELECT account_id,
  SUM(CASE WHEN type='income' THEN amount ELSE -amount END) as net
FROM transactions
WHERE account_id IS NOT NULL
  AND status = 'completed'
  AND COALESCE(is_provisional, false) = false
  AND date <= CURRENT_DATE
GROUP BY account_id
```

No hook `useAccounts`, cada conta terá seu saldo substituído pelo valor calculado. Contas que possuem saldo inicial (definido manualmente na criação) precisam de um ajuste: o saldo inicial armazenado em `current_balance` serve como base, mas como ele já inclui transações importadas, a abordagem mais limpa é somar diretamente as transações.

**Porém**, como as transações não incluem o saldo inicial da conta (que foi definido na criação), precisamos de uma coluna `initial_balance` OU usar o `current_balance` como "saldo base + delta de transações". 

A abordagem mais simples sem migração: continuar usando `current_balance` como saldo exibido, mas na hora de atualizar durante importações, calcular corretamente excluindo pendentes. E para corrigir o valor AGORA, usar a sincronização do OFX (que já está implementada).

**Abordagem final escolhida:** Adicionar coluna `initial_balance` à tabela `accounts` para guardar o saldo inicial. Depois calcular o saldo exibido = `initial_balance` + soma(transações completed, não-provisórias, data <= hoje). Migração: `initial_balance = current_balance - soma_todas_transações`.

**Alternativa mais simples (sem migração):** Mudar `useAccounts` para fazer uma segunda query e ajustar o saldo subtraindo transações pendentes/futuras do `current_balance` armazenado. Ou seja: `saldo_real = current_balance - net_pending_future`.

Vou usar a alternativa simples:

**`src/hooks/useAccounts.ts`:**
- Query adicional: buscar soma de transações pendentes/provisórias/futuras por conta
- `adjusted_balance = current_balance + net_pending_future` (pendentes são negativas, então somar as remove)
- Espera... o `current_balance` atual é -442.84 e não sabemos como chegou ali. O `current_balance` deveria ser o saldo real mas tem drift.

**Conclusão:** A forma mais robusta é usar a sincronização OFX que já existe para corrigir o saldo para 69.15, e TAMBÉM parar de incluir transações pending no cálculo incremental durante importações futuras. Mas o usuário quer que funcione AGORA sem reimportar.

**Abordagem definitiva:** Computar o saldo 100% a partir das transações, usando o `current_balance` como `initial_balance` implícito:

```
saldo_exibido = current_balance 
  - soma(pending/provisional/futuras que já foram contabilizadas no current_balance)
```

Mas não sabemos quais transações foram contabilizadas no `current_balance`.

**A abordagem mais pragmática:** Adicionar `initial_balance` via migração, setar `initial_balance = current_balance - soma_todas_transações`, e depois calcular `saldo = initial_balance + soma(completed, !provisional, date<=today)`.

### Plano final

1. **Migração SQL:** Adicionar coluna `initial_balance` em `accounts`. Calcular `initial_balance = current_balance - sum(transações)` para cada conta existente.

2. **`src/hooks/useAccounts.ts`:** Query que calcula saldo = `initial_balance` + soma(transações completed, não-provisórias, date <= hoje). Exibir esse valor em vez de `current_balance`.

3. **`src/components/modals/AccountReviewModal.tsx`:** Ao importar, NÃO mais atualizar `current_balance` incrementalmente — o saldo será sempre calculado dinamicamente.

4. **`src/hooks/useCreditCards.ts`:** Ao pagar fatura (debita da conta), NÃO mais atualizar `current_balance` — o saldo será recalculado automaticamente pois a transação de pagamento já é criada.

5. **`src/pages/Dashboard.tsx`:** Remover lógica de `projectedBalance` (já desnecessária).

6. **`src/components/modals/AccountModal.tsx`:** Ao criar/editar conta, salvar o saldo informado em `initial_balance` (e `current_balance` para compatibilidade).


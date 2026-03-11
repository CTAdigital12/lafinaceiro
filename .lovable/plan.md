

## Diagnóstico

A migração anterior usou a fórmula errada. Ela calculou:

```
initial_balance = current_balance - realized_net
              = -442.84 - (-1312.20) = 869.36
computed       = 869.36 + (-1312.20) = -442.84  ← errado
```

O problema é que `current_balance` (-442.84) já estava corrompido por atualizações incrementais que incluíam transações pendentes/futuras. Não é possível derivar o saldo real (69.15) apenas a partir dos dados internos — o único valor correto veio do OFX do banco.

A fórmula correta para o `initial_balance` seria:
```
initial_balance = saldo_real_desejado - realized_net
                = 69.15 - (-1312.20) = 1381.35
computed        = 1381.35 + (-1312.20) = 69.15  ✓
```

## Plano

1. **Migração SQL corretiva**: Atualizar o `initial_balance` desta conta para `1381.35`. Como `current_balance` já estava errado antes de qualquer mudança nossa, não há como derivar o valor correto automaticamente — precisa ser o valor real do banco.

   A migração vai usar a mesma lógica genérica: `initial_balance = current_balance - SUM(ALL transactions)` (usando TODAS as transações, não apenas realizadas), pois `current_balance` foi construído a partir de TODAS. Isso dá `1793.44`. Mas isso resulta em 481.24, não 69.15.

   **Conclusão**: O `current_balance` original já estava errado por ~412 reais (drift acumulado de atualizações incrementais defeituosas anteriores). A única opção é corrigir pontualmente usando o valor do OFX.

   Vou setar `initial_balance` = `current_balance - SUM(all_tx)` = `1793.44` **e depois** também atualizar `current_balance` para o valor correto do banco (69.15), recalculando `initial_balance = 69.15 - (-1312.20) = 1381.35`.

2. **Nenhuma mudança de código** — o hook `useAccounts` já calcula corretamente `computed_balance = initial_balance + realized_net`. O problema é puramente de dados.

## Seção técnica

Migração SQL:
```sql
UPDATE accounts a
SET initial_balance = a.current_balance - COALESCE(
  (SELECT SUM(CASE WHEN t.type='income' THEN t.amount ELSE -t.amount END)
   FROM transactions t WHERE t.account_id = a.id), 0
);
```

Isso restaura `initial_balance` para o valor que existia antes da segunda migração (1793.44), mas o saldo exibido será 481.24 — ainda não 69.15, pois o `current_balance` original já era incorreto.

Para corrigir de verdade, o usuário precisa usar a funcionalidade de "Sincronizar Saldo" (que já existe) após reimportar o OFX, ou editar manualmente o saldo da conta para 69.15 (a lógica do AccountModal já converte para `initial_balance` correto).

**Alternativa direta**: Se o usuário confirmar que 69.15 é o saldo correto, posso executar uma migração que seta `initial_balance = 1381.35` diretamente para essa conta específica.


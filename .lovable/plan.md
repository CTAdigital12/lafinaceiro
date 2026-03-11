
Objetivo: corrigir o saldo exibido para R$ 69,15 agora e evitar nova divergência no cálculo global de saldo.

Diagnóstico confirmado
- Hoje o app calcula: `saldo_exibido = initial_balance + soma(realizados)`.
- Na sua conta:
  - `initial_balance = 1793,44`
  - `soma(realizados) = -1312,20`
  - saldo exibido = `481,24`
- Para exibir R$ 69,15 com a regra atual (excluir pendentes/provisórios/futuros), o `initial_balance` correto desta conta precisa ser **1381,35**.

Plano de implementação
1) Correção imediata de dados (1 conta)
- Executar ajuste pontual no banco para recalcular `initial_balance` da conta corrente com base no saldo real informado (69,15):
  - `initial_balance = saldo_real_desejado - soma(realizados)`.
- Isso corrige imediatamente o saldo em Contas e Dashboard sem mexer nas transações.

2) Corrigir UX de edição de conta (evitar erro futuro)
- Em `AccountModal`, quando o usuário editar “Saldo Atual”, interpretar esse valor como saldo final desejado e **converter internamente** para `initial_balance`:
  - `new_initial_balance = saldo_digitado - soma(realizados_da_conta)`.
- Hoje o modal grava o valor digitado direto em `initial_balance`, o que gera saldo incorreto.

3) Ajustar exibição do “Saldo do Sistema” na sincronização
- Em `AccountReviewModal`, o bloco de sincronização hoje mostra `current_balance` (campo legado), que pode divergir.
- Trocar para mostrar o saldo calculado real (mesma regra do app), para evitar inconsistência visual durante a decisão “Sincronizar”.

4) Validação end-to-end
- Confirmar em `/accounts` e Dashboard: saldo da conta e saldo total = **R$ 69,15**.
- Confirmar que os 4 lançamentos futuros/pending continuam fora do saldo.
- Reimportar OFX e validar:
  - tela de sincronização abre;
  - “Sincronizar” mantém o saldo correto.

Seção técnica
- Fórmula única do saldo real:
  - `saldo_real = initial_balance + SUM(CASE WHEN type='income' THEN amount ELSE -amount END)`
  - filtros: `status='completed'`, `is_provisional=false`, `date <= CURRENT_DATE`.
- Ajuste pontual para sua conta:
  - `required_initial_balance = 69.15 - (-1312.20) = 1381.35`.
- Sem mudanças de RLS; apenas atualização de dados + ajuste de lógica no frontend.

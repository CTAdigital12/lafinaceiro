
Objetivo: corrigir o bug que impede a sincronização do saldo após importar OFX, para que o saldo da conta possa bater com o banco.

Diagnóstico confirmado
- O parser do OFX já extrai o saldo (`BALAMT`) corretamente.
- O fluxo atual executa `PATCH` no saldo incremental e fecha o modal antes de mostrar a tela “Sincronizar saldo”.
- Causa raiz em `AccountReviewModal.tsx`:
  - `setShowBalanceSync(true)` é chamado, mas logo depois existe `if (!showBalanceSync) onOpenChange(false)`.
  - Como `setState` é assíncrono, `showBalanceSync` ainda está `false` nessa execução, então o modal fecha indevidamente.
- Evidência prática: houve `PATCH` com `current_balance: -442.84` e não houve segundo `PATCH` para `69.15`.

Plano de implementação
1) Ajustar controle de fechamento do modal (arquivo `src/components/modals/AccountReviewModal.tsx`)
- No `handleImport`, substituir a decisão baseada no estado React (`showBalanceSync`) por uma flag local síncrona, por exemplo:
  - `const shouldPromptSync = bankBalance != null;`
- Se `shouldPromptSync` for `true`:
  - manter o modal aberto,
  - setar `setShowBalanceSync(true)`,
  - não chamar `onOpenChange(false)` nesse ciclo.
- Se `shouldPromptSync` for `false`:
  - manter comportamento atual de fechamento.

2) Garantir comportamento consistente no pós-importação
- Manter a tela de sincronização aparecendo mesmo quando:
  - todas as transações forem duplicadas, ou
  - não houver novos lançamentos criados (ainda assim o usuário precisa escolher sincronizar/manter).
- Manter os handlers já existentes:
  - `Sincronizar` → grava `current_balance = bankBalance`;
  - `Manter saldo atual` → fecha sem sobrescrever.

3) Validação funcional (end-to-end)
- Reimportar o OFX da conta corrente.
- Esperado:
  - após “Confirmar Importação”, abrir modal “Sincronizar Saldo” (não fechar direto).
  - ao clicar “Sincronizar”, fazer `PATCH` com `current_balance = 69.15`.
  - cartão de conta e saldo total refletirem o novo valor.
- Cenário alternativo:
  - clicar “Manter saldo atual” deve preservar o saldo incremental e fechar normalmente.

Seção técnica (resumo)
- Arquivo afetado: `src/components/modals/AccountReviewModal.tsx`.
- Mudança central: remover dependência de estado assíncrono para decidir fechamento imediato do modal.
- Não requer migração de banco nem mudança de RLS.

---
id: ADR-0004
type: decision
title: Conta única nas policies — os dois logins veem, alteram e apagam os mesmos dados
status: proposed
created_at: 2026-11-21
reviewed_at: null
owner: André Domingues
scope: project
files:
  - supabase/migrations/20261121180000_conta_unica_ver_alterar_apagar.sql
  - supabase/tests/conta_unica.sql
  - supabase/functions/add-member/index.ts
  - src/hooks/useBudgets.ts
  - src/lib/budgetsToCopy.ts
  - src/hooks/useUnlinkedIncomes.ts
  - src/hooks/useReimbursementIncomeCandidates.ts
deps: []
related_prs: []
supersedes: []
review_required: false
---

## Contexto
O modelo de uso já era declarado CONTA ÚNICA no cabeçalho da migration do A1 (20260817120000):
`user_id` só registra quem digitou, não é fronteira de privacidade. As policies e o cliente não
seguiam isso:

- `shared_access` só tinha o sentido dono → membro (é o que `add-member` gravava). O que o membro
  gravava ficava invisível para o dono: 12 metas do membro, 8 delas em paralelo às do dono na mesma
  categoria e mês, e as categorias padrão do cadastro do membro aparecendo em dobro para ele.
- `pg_policies` de produção em 21/11/2026: DELETE "só próprio" em todas as tabelas; SELECT "só próprio"
  em `credit_card_invoices` e `categorization_rules`; UPDATE "só próprio" em `investment_*`.
- Sete consultas do cliente filtravam `.eq("user_id", user.id)` ao LER, duas delas de propósito, como
  "defesa em profundidade vs. shared_access", o que contradiz o modelo.
- `budgets` tem unique `(user_id, category_id, month, year)`: o membro criando meta numa categoria que
  já tinha meta do dono gerava uma segunda linha, em vez de alterar a existente.

## Decisão
- SELECT, UPDATE e DELETE passam a "próprio OU de quem compartilha comigo" em 12 tabelas, com uma
  policy permissiva por comando (`conta_unica_*`). O UPDATE repete o teste no WITH CHECK.
- INSERT continua "só próprio": a linha nova sai no nome de quem digitou.
- `pluggy_items` fica "só próprio": é o consentimento Open Finance de uma pessoa com o próprio banco.
- `shared_access` nos dois sentidos. `add-member` grava a volta (membro → dono) e apaga as categorias
  padrão **só quando a conta é criada no próprio convite**.
- O cliente não filtra por `user_id` ao ler dado financeiro. `createBudget` atualiza a meta que já
  existe na categoria e mês, de qualquer login; `planBudgetCopy` deduplica por categoria.

## Alternativas consideradas
- **Um "dono efetivo" (gravar tudo com o `user_id` do dono):** some o registro de quem digitou e exige
  mexer em toda inserção e em toda RPC. Descartada.
- **Trocar a unique de `budgets` para `(category_id, month, year)`:** resolveria a duplicata no banco,
  mas não há "conta" como entidade; dois casais distintos colidiriam. Fica no cliente.
- **Volta automática também para conta que já existia:** o dono passaria a ler os dados de outra
  pessoa sem o consentimento dela. Descartada; nesse caso a volta é aplicada à mão.

## Consequências
- O membro corrige e apaga o que o dono lançou, e vice-versa. O MFA (RESTRICTIVE `require_aal2`)
  continua por cima.
- O modelo vale para UM grupo por `shared_access`; um terceiro login exigiria pares com todos.
- Migration e edge function não se aplicam sozinhas: SQL Editor e `supabase functions deploy add-member`.

## Evidências
- `supabase/tests/conta_unica.sql`: o bloco "antes" reproduz o defeito; depois da migration, membro vê,
  altera e apaga o do dono; estranho, aal1, entregar a linha a terceiro e INSERT em nome alheio continuam
  recusados; catálogo com 36 `conta_unica_*` e as 12 de INSERT intactas.
- `src/hooks/__tests__/useBudgets.contaUnica.test.tsx` e `src/lib/__tests__/budgetsToCopy.test.ts`
  falham sem a correção e passam com ela.
- Dados corrigidos à mão em 21/11/2026: volta do `shared_access`, 4 metas movidas, 8 duplicadas e
  11 categorias vazias do membro apagadas.

## Revisão / obsolescência
Revisar se o app passar a ter mais de um grupo de usuários, um terceiro login, ou uma entidade
"conta/família" própria. Qualquer policy nova em tabela financeira deve seguir o padrão `conta_unica_*`.

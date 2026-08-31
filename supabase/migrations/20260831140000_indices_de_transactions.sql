-- Índices nas colunas que toda tela filtra (achado M8).
--
-- A tabela tinha índice para `installment_group_id`, `split_*`,
-- `reimbursement_*`, `is_corporate_expense` e `card_last_digits` — colunas de
-- nicho — e NENHUM para `date`, `account_id` ou `credit_card_id`, que são as
-- que aparecem em praticamente toda consulta. Toda listagem era seq scan.
--
-- O FORMATO destes índices foi MEDIDO, não deduzido, num Postgres 16 local com
-- 50.000 lançamentos, dois usuários e a policy de RLS real (o `OR EXISTS` de
-- `shared_access`). A auditoria sugeria índice em `user_id`; a medição mostrou
-- que isso é o pior dos caminhos:
--
--   consulta da tela principal (janela de datas, ordenada, LIMIT 50):
--     sem índice ............................. 6,744 ms  (Seq Scan)
--     índice (user_id, date desc) ............ 4,185 ms  (Bitmap + Sort)
--     índice (date desc) ..................... 0,533 ms  (Index Scan ordenado)
--
-- Duas razões:
--   1. `useTransactions` NÃO filtra `user_id` — depende só da RLS, e ali o
--      `user_id` está dentro de um `OR`, então não vira condição de índice;
--   2. no modelo de conta única, `user_id` tem DOIS valores distintos. Como
--      primeira coluna de índice, não seleciona nada.
--
-- Mesmo nos 6 hooks que filtram `user_id` explicitamente, `(date desc)` sozinho
-- ganhou de `(user_id, date desc)` — 0,044 ms contra 0,074 ms.
--
-- Sem CONCURRENTLY de propósito: o SQL Editor do Supabase roda em transação, e
-- CREATE INDEX CONCURRENTLY não pode. A tabela é pequena e o lock é breve.

-- A consulta de toda listagem: janela de datas, ordenada por data desc.
create index if not exists idx_transactions_date
  on public.transactions (date desc);

-- Saldo da conta: soma das realizadas. Medido 5,692 ms -> 1,858 ms.
-- Parcial porque lançamento de cartão tem `account_id` nulo — cerca de um terço
-- das linhas fica fora do índice.
create index if not exists idx_transactions_account
  on public.transactions (account_id)
  where account_id is not null;

-- Fatura e competência: `credit_card_id` sozinho para o recálculo, mais
-- `due_date` para o `competenceRangeFilter`, que recorta o período pelo
-- vencimento quando a linha é de cartão.
create index if not exists idx_transactions_card_due
  on public.transactions (credit_card_id, due_date)
  where credit_card_id is not null;

comment on index public.idx_transactions_date is
  'Listagem por período. Formato medido: (date) sozinho vence (user_id, date), '
  'porque sob RLS o user_id fica dentro de um OR e não vira condição de índice.';

-- Adiciona `is_reimbursable` em `categories`. Quando true, toda despesa criada
-- (ou que tenha sua categoria definida) nessa categoria já entra marcada como
-- reembolsável (transactions.is_reimbursable = true), sem precisar editar a
-- transação manualmente depois.
--
-- Não nullable: default false, igual aos demais flags booleanos da base.

alter table public.categories
  add column if not exists is_reimbursable boolean not null default false;

comment on column public.categories.is_reimbursable is
  'Quando true, despesas desta categoria são automaticamente marcadas como '
  'reembolsáveis no cadastro da transação.';

-- Backfill: categorias de despesa cujo nome indica reembolso já passam a ser
-- reembolsáveis (cobre a categoria "reembolso" / "Compras reembolsáveis" que
-- o usuário já utiliza hoje).
update public.categories
   set is_reimbursable = true
 where type = 'expense'
   and name ilike '%reembols%';

-- Garante que o PostgREST recarregue o schema cache após a mudança.
notify pgrst, 'reload schema';

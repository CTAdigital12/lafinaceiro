-- Prova da migration 20261121180000 (conta única: ver, alterar e apagar).
--
-- Autocontido e rerrodável: monta stubs de `auth`, as 12 tabelas (só as
-- colunas que importam), as policies como estavam em PRODUÇÃO em 21/11/2026
-- (pg_policies), roda a migration SEM MODIFICAR e exercita os cenários.
-- Rodar da raiz do repositório, num banco limpo:
--
--   psql -h /tmp/lfs -p 54329 -U postgres -q -v ON_ERROR_STOP=1 \
--        -f supabase/tests/conta_unica.sql
--
-- Cada cenário imprime `ok` ou `FALHOU`. RLS não se aplica ao dono da tabela:
-- por isso tudo roda sob `set local role authenticated`.

create extension if not exists pgcrypto;
create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object('aal', coalesce(current_setting('test.aal', true), 'aal1'))
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

do $$
declare
  t text;
  tabelas text[] := array['accounts','budgets','categories','categorization_rules',
    'credit_card_invoices','credit_cards','investment_assets','investment_institutions',
    'investment_transactions','projects','recurring_rules','transactions'];
  compartilhado text;
begin
  execute 'drop table if exists public.shared_access cascade';
  create table public.shared_access (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    shared_with_user_id uuid not null
  );
  alter table public.shared_access enable row level security;
  create policy "Owners and shared users can view access" on public.shared_access
    for select using (auth.uid() = owner_id or auth.uid() = shared_with_user_id);

  foreach t in array tabelas loop
    execute format('drop table if exists public.%I cascade', t);
    execute format('create table public.%I (id uuid primary key default gen_random_uuid(), user_id uuid not null, nome text)', t);
    execute format('alter table public.%I enable row level security', t);

    compartilhado := format('auth.uid() = user_id or exists (select 1 from public.shared_access '
      'where shared_with_user_id = auth.uid() and owner_id = %I.user_id)', t);

    -- Estado de produção em 21/11/2026.
    execute format('create policy "Users can insert own %s" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('create policy "Users can delete own %s" on public.%I for delete using (auth.uid() = user_id)', t, t);

    if t in ('categorization_rules', 'credit_card_invoices') then
      execute format('create policy "Users can view own %s" on public.%I for select using (auth.uid() = user_id)', t, t);
    else
      execute format('create policy "Users can view own or shared %s" on public.%I for select using (%s)', t, t, compartilhado);
    end if;

    if t in ('categorization_rules', 'investment_assets', 'investment_institutions', 'investment_transactions') then
      execute format('create policy "Users can update own %s" on public.%I for update using (auth.uid() = user_id)', t, t);
    else
      execute format('create policy "Users can update own or shared %s" on public.%I for update using (%s)', t, t, compartilhado);
    end if;

    -- Portão de aal2 do A1.
    execute format($f$create policy require_aal2 on public.%I as restrictive for all to authenticated
      using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2')$f$, t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

grant usage on schema public, auth to authenticated;
grant select on public.shared_access to authenticated;

\set dono     '11111111-1111-1111-1111-111111111111'
\set membro   '22222222-2222-2222-2222-222222222222'
\set estranho '33333333-3333-3333-3333-333333333333'

-- Compartilhamento nos dois sentidos, como ficou em produção.
insert into public.shared_access (owner_id, shared_with_user_id) values
  (:'dono', :'membro'), (:'membro', :'dono');

-- Uma linha do dono em cada tabela, e uma linha do estranho em transactions.
do $$
declare t text;
begin
  foreach t in array array['accounts','budgets','categories','categorization_rules',
    'credit_card_invoices','credit_cards','investment_assets','investment_institutions',
    'investment_transactions','projects','recurring_rules','transactions'] loop
    execute format($i$insert into public.%I (user_id, nome) values ('11111111-1111-1111-1111-111111111111', 'do dono')$i$, t);
  end loop;
end $$;
insert into public.transactions (user_id, nome) values (:'estranho', 'do estranho');

create or replace function pg_temp.veredito(cenario text, esperado bigint, obtido bigint)
returns text language sql as $$
  select format('%s %s (esperado %s, obtido %s)',
                case when esperado = obtido then 'ok     ' else 'FALHOU ' end, cenario, esperado, obtido)
$$;

\echo '--- ANTES da migration (reproduz o defeito) ---'
begin; set local role authenticated;
select set_config('test.uid', :'membro', true), set_config('test.aal', 'aal2', true) \gset
select pg_temp.veredito('antes: membro vê regras do dono (defeito = 0)', 0,
  (select count(*) from public.categorization_rules));
select pg_temp.veredito('antes: membro vê faturas do dono (defeito = 0)', 0,
  (select count(*) from public.credit_card_invoices));
with d as (delete from public.transactions where nome = 'do dono' returning 1)
select pg_temp.veredito('antes: membro apaga lançamento do dono (defeito = 0)', 0, (select count(*) from d));
rollback;

\i supabase/migrations/20261121180000_conta_unica_ver_alterar_apagar.sql

\echo '--- DEPOIS da migration ---'

-- 1. Membro em aal2 vê a linha do dono nas 12 tabelas.
begin; set local role authenticated;
select set_config('test.uid', :'membro', true), set_config('test.aal', 'aal2', true) \gset
select pg_temp.veredito('membro vê regras do dono', 1, (select count(*) from public.categorization_rules));
select pg_temp.veredito('membro vê faturas do dono', 1, (select count(*) from public.credit_card_invoices));
select pg_temp.veredito('membro vê lançamentos do dono, não os do estranho', 1, (select count(*) from public.transactions));
with u as (update public.investment_assets set nome = 'corrigido' returning 1)
select pg_temp.veredito('membro altera investimento do dono', 1, (select count(*) from u));
with u as (update public.categorization_rules set nome = 'corrigida' returning 1)
select pg_temp.veredito('membro altera regra do dono', 1, (select count(*) from u));
with d as (delete from public.transactions where nome = 'do dono' returning 1)
select pg_temp.veredito('membro apaga lançamento do dono', 1, (select count(*) from d));
with d as (delete from public.transactions where nome = 'do estranho' returning 1)
select pg_temp.veredito('membro NÃO apaga lançamento do estranho', 0, (select count(*) from d));
rollback;

-- 2. Dono vê o que o membro grava (o sentido que faltava).
begin; set local role authenticated;
select set_config('test.uid', :'membro', true), set_config('test.aal', 'aal2', true) \gset
insert into public.budgets (user_id, nome) values (:'membro', 'meta do membro');
select set_config('test.uid', :'dono', true) \gset
select pg_temp.veredito('dono vê a meta gravada pelo membro', 1,
  (select count(*) from public.budgets where nome = 'meta do membro'));
rollback;

-- 3. Estranho não vê, não altera, não apaga nada do dono.
begin; set local role authenticated;
select set_config('test.uid', :'estranho', true), set_config('test.aal', 'aal2', true) \gset
select pg_temp.veredito('estranho não vê lançamento do dono', 0,
  (select count(*) from public.transactions where nome = 'do dono'));
with u as (update public.accounts set nome = 'x' returning 1)
select pg_temp.veredito('estranho não altera conta do dono', 0, (select count(*) from u));
with d as (delete from public.budgets returning 1)
select pg_temp.veredito('estranho não apaga meta do dono', 0, (select count(*) from d));
rollback;

-- 4. Sem MFA (aal1) o membro não vê nada: o portão do A1 continua por cima.
begin; set local role authenticated;
select set_config('test.uid', :'membro', true), set_config('test.aal', 'aal1', true) \gset
select pg_temp.veredito('membro em aal1 não vê nada', 0, (select count(*) from public.transactions));
with d as (delete from public.transactions returning 1)
select pg_temp.veredito('membro em aal1 não apaga nada', 0, (select count(*) from d));
rollback;

-- 5. UPDATE não entrega a linha para quem não compartilha.
begin; set local role authenticated;
select set_config('test.uid', :'membro', true), set_config('test.aal', 'aal2', true) \gset
do $$
begin
  update public.transactions set user_id = '33333333-3333-3333-3333-333333333333' where nome = 'do dono';
  raise notice 'FALHOU  membro entregou a linha ao estranho';
exception when insufficient_privilege then
  raise notice 'ok      membro NÃO entrega a linha ao estranho (WITH CHECK)';
end $$;
rollback;

-- 6. INSERT continua só no próprio nome.
begin; set local role authenticated;
select set_config('test.uid', :'membro', true), set_config('test.aal', 'aal2', true) \gset
do $$
begin
  insert into public.transactions (user_id, nome) values ('11111111-1111-1111-1111-111111111111', 'em nome do dono');
  raise notice 'FALHOU  membro inseriu em nome do dono';
exception when insufficient_privilege then
  raise notice 'ok      membro NÃO insere em nome do dono';
end $$;
rollback;

-- 7. Catálogo: 36 policies conta_unica_* e as 12 de INSERT intactas.
select pg_temp.veredito('36 policies conta_unica_*', 36,
  (select count(*) from pg_policies where schemaname = 'public' and policyname like 'conta_unica_%'));
select pg_temp.veredito('12 policies de INSERT intactas', 12,
  (select count(*) from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE'
     and cmd = 'INSERT' and tablename <> 'shared_access'));
select pg_temp.veredito('nenhuma permissiva antiga de SELECT/UPDATE/DELETE sobrou', 0,
  (select count(*) from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE'
     and cmd in ('SELECT','UPDATE','DELETE') and tablename <> 'shared_access'
     and policyname not like 'conta_unica_%'));

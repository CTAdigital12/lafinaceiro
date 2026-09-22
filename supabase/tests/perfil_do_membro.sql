-- Prova da migration 20260922180000 (M4 — lista de membros sem nome nem e-mail).
--
-- Autocontido de propósito: monta os stubs de `auth`, as tabelas e as policies
-- REAIS, roda a migration SEM MODIFICAR e depois exercita os cenários. Rodar
-- da raiz do repositório, num banco limpo:
--
--   psql -h /tmp/lfs -p 54329 -U postgres -q -v ON_ERROR_STOP=1 \
--        -f supabase/tests/perfil_do_membro.sql
--
-- Cada cenário imprime `esperado` e `obtido` e um veredito. RLS não se aplica
-- ao dono da tabela: sem o `set local role authenticated` tudo passaria e o
-- teste daria falso "seguro".

create extension if not exists pgcrypto;

-- Stubs no lugar do GoTrue, controláveis por session setting.
create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object('aal', coalesce(current_setting('test.aal', true), 'aal1'))
$$;

-- Rerrodável no mesmo cluster: as policies caem junto com as tabelas.
drop table if exists public.profiles, public.shared_access cascade;

create table public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  avatar_url text
);

create table public.shared_access (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  shared_with_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, shared_with_user_id)
);

do $$ begin
  -- `create role` é do CLUSTER, não do banco: num cluster reusado já existe.
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.shared_access enable row level security;

-- As permissivas REAIS que já existem em produção.
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Owners and shared users can view access" on public.shared_access
  for select using (auth.uid() = owner_id or auth.uid() = shared_with_user_id);

-- O portão de aal2 do A1, na mesma forma da migration 20260817120000.
create policy require_aal2 on public.profiles
  as restrictive for all to authenticated
  using      ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy require_aal2 on public.shared_access
  as restrictive for all to authenticated
  using      ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

grant usage on schema public, auth to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.shared_access to authenticated;

\set dono    '11111111-1111-1111-1111-111111111111'
\set membro  '22222222-2222-2222-2222-222222222222'
\set estranho '33333333-3333-3333-3333-333333333333'

insert into public.profiles (id, email, full_name) values
  (:'dono',     'dono@exemplo.com',     'Dona da Conta'),
  (:'membro',   'membro@exemplo.com',   'Membro Convidado'),
  (:'estranho', 'estranho@exemplo.com', 'Pessoa Estranha');

insert into public.shared_access (owner_id, shared_with_user_id)
values (:'dono', :'membro');

\echo ''
\echo '=== ANTES da migration: o dono não enxerga o perfil do membro (é o M4) ==='
begin;
  set local role authenticated;
  select set_config('test.uid', :'dono', true), set_config('test.aal', 'aal2', true);
  select 0 as esperado, count(*) as obtido,
         case when count(*) = 0 then 'OK — defeito reproduzido' else 'FALHOU' end as veredito
    from public.profiles where id = :'membro';
rollback;

\echo ''
\echo '=== aplicando a migration, sem modificar ==='
\i supabase/migrations/20260922180000_dono_ve_perfil_do_membro.sql

\echo ''
\echo '=== 1. o dono passa a ver nome e e-mail do membro ==='
begin;
  set local role authenticated;
  select set_config('test.uid', :'dono', true), set_config('test.aal', 'aal2', true);
  select 1 as esperado, count(*) as obtido,
         case when count(*) = 1 then 'OK' else 'FALHOU' end as veredito
    from public.profiles where id = :'membro';
  select full_name, email from public.profiles where id = :'membro';
rollback;

\echo ''
\echo '=== 2. o dono continua vendo o próprio perfil (a policy velha não quebrou) ==='
begin;
  set local role authenticated;
  select set_config('test.uid', :'dono', true), set_config('test.aal', 'aal2', true);
  select 1 as esperado, count(*) as obtido,
         case when count(*) = 1 then 'OK' else 'FALHOU' end as veredito
    from public.profiles where id = :'dono';
rollback;

\echo ''
\echo '=== 3. estranho NÃO vê o perfil do membro ==='
begin;
  set local role authenticated;
  select set_config('test.uid', :'estranho', true), set_config('test.aal', 'aal2', true);
  select 0 as esperado, count(*) as obtido,
         case when count(*) = 0 then 'OK' else 'FALHOU' end as veredito
    from public.profiles where id = :'membro';
rollback;

\echo ''
\echo '=== 4. o portão de aal2 continua valendo: dono em AAL1 não vê NADA ==='
begin;
  set local role authenticated;
  select set_config('test.uid', :'dono', true), set_config('test.aal', 'aal1', true);
  select 0 as esperado, count(*) as obtido,
         case when count(*) = 0 then 'OK' else 'FALHOU — a permissiva furou o A1' end as veredito
    from public.profiles;
rollback;

\echo ''
\echo '=== 5. o caminho inverso segue fechado: o membro NÃO vê o perfil do dono ==='
begin;
  set local role authenticated;
  select set_config('test.uid', :'membro', true), set_config('test.aal', 'aal2', true);
  select 0 as esperado, count(*) as obtido,
         case when count(*) = 0 then 'OK — fora do escopo, como documentado' else 'FALHOU' end as veredito
    from public.profiles where id = :'dono';
rollback;

\echo ''
\echo '=== 6. é SÓ leitura: o dono não consegue alterar o perfil do membro ==='
begin;
  set local role authenticated;
  select set_config('test.uid', :'dono', true), set_config('test.aal', 'aal2', true);
  with alterado as (
    update public.profiles set full_name = 'Nome Trocado' where id = :'membro' returning 1
  )
  select 0 as esperado, count(*) as obtido,
         case when count(*) = 0 then 'OK' else 'FALHOU — a policy virou escrita' end as veredito
    from alterado;
rollback;

\echo ''
\echo '=== 7. revogar o acesso esconde o perfil na mesma hora ==='
begin;
  delete from public.shared_access where owner_id = :'dono' and shared_with_user_id = :'membro';
  set local role authenticated;
  select set_config('test.uid', :'dono', true), set_config('test.aal', 'aal2', true);
  select 0 as esperado, count(*) as obtido,
         case when count(*) = 0 then 'OK' else 'FALHOU' end as veredito
    from public.profiles where id = :'membro';
rollback;

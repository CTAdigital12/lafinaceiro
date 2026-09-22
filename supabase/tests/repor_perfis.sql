-- Prova da migration 20260922200000 (repor perfis a partir de auth.users).
--
-- Rodar da raiz do repositório, num banco limpo:
--
--   psql -h /tmp/lfs -p 54329 -U postgres -q -v ON_ERROR_STOP=1 \
--        -f supabase/tests/repor_perfis.sql
--
-- Não precisa de `set local role authenticated`: aqui o que se testa é o
-- INSERT, não policy. Rerrodável — derruba as próprias tabelas no início.

drop table if exists public.profiles cascade;
drop table if exists auth.users cascade;
create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create table public.profiles (
  id uuid primary key,
  email text,
  full_name text
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'dono@exemplo.com',   '{"full_name": "Dona da Conta"}'),
  ('22222222-2222-2222-2222-222222222222', 'membro@exemplo.com', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'intacto@exemplo.com','{"full_name": "Já Tinha Perfil"}');

-- Quem já tem perfil não pode ser tocado, nem ter o nome sobrescrito.
insert into public.profiles (id, email, full_name)
values ('33333333-3333-3333-3333-333333333333', 'intacto@exemplo.com', 'Nome Escolhido Pelo Usuário');

\echo ''
\echo '=== ANTES: 2 contas sem perfil ==='
select 2 as esperado, count(*) filter (where p.id is null) as obtido,
       case when count(*) filter (where p.id is null) = 2 then 'OK' else 'FALHOU' end as veredito
  from auth.users u left join public.profiles p on p.id = u.id;

\echo ''
\echo '=== aplicando a migration, sem modificar ==='
\i supabase/migrations/20260922200000_repor_perfis_a_partir_de_auth_users.sql

\echo ''
\echo '=== 1. ninguém fica sem perfil ==='
select 0 as esperado, count(*) filter (where p.id is null) as obtido,
       case when count(*) filter (where p.id is null) = 0 then 'OK' else 'FALHOU' end as veredito
  from auth.users u left join public.profiles p on p.id = u.id;

\echo ''
\echo '=== 2. o e-mail veio do auth, e o nome quando existe ==='
select id, email, full_name from public.profiles order by email;

\echo ''
\echo '=== 3. o perfil que já existia NÃO foi sobrescrito ==='
select 'Nome Escolhido Pelo Usuário' as esperado, full_name as obtido,
       case when full_name = 'Nome Escolhido Pelo Usuário' then 'OK' else 'FALHOU' end as veredito
  from public.profiles where id = '33333333-3333-3333-3333-333333333333';

\echo ''
\echo '=== 4. idempotente: rodar de novo não duplica nem altera ==='
\i supabase/migrations/20260922200000_repor_perfis_a_partir_de_auth_users.sql
select 3 as esperado, count(*) as obtido,
       case when count(*) = 3 then 'OK' else 'FALHOU' end as veredito
  from public.profiles;

-- !!! NÃO RODAR NO SQL EDITOR DO SUPABASE NEM EM PRODUÇÃO !!!
-- Este script APAGA a tabela transactions (truncate). Só roda com `psql` num
-- Postgres descartável local — ver supabase/tests/README.md. A migração que vai
-- para produção é supabase/migrations/20261121120000_reembolso_recebe_categoria.sql.
--
-- A receita do reembolso ganha a categoria "Reembolsos Diversos"
-- (migration 20261121120000).
--
-- Rerrodável. Exige o schema.sql e a migration 20260531010000
-- (settle_reimbursement) já carregados (ver README.md). Cria a própria tabela
-- `categories`, que o schema.sql não tem. APLICA a migration nova no meio
-- (`\i`): o primeiro bloco roda contra a função ANTIGA e precisa falhar — é o
-- que prova que o teste mede alguma coisa.
--
-- Cenário: o caso real — PIX de 552,00 do extrato, sem categoria, vinculado
-- como reembolso de uma despesa.

\set QUIET on
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  type text not null,
  parent_id uuid,
  created_at timestamptz not null default now()
);
truncate public.transactions cascade;
truncate public.categories cascade;

-- Usuário 1 tem a categoria; uma de DESPESA com o mesmo nome serve de isca.
-- Usuário 2 não tem nenhuma.
insert into public.categories (id, user_id, name, type, created_at) values
  ('ca000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Reembolsos Diversos','income', '2026-01-01'),
  ('ca000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Reembolsos Diversos','expense','2025-01-01'),
  ('ca000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Salário',            'income', '2026-01-01');

\set u1 '''11111111-1111-1111-1111-111111111111'''
\set u2 '''22222222-2222-2222-2222-222222222222'''
\set conta '''aaaa0000-0000-0000-0000-000000000001'''

insert into public.transactions
  (id, user_id, account_id, category_id, description, amount, type, date, status, reimbursement_status)
values
  -- despesas reembolsáveis
  ('e0000000-0000-0000-0000-000000000001',:u1,:conta,null,'Despesa A',552.00,'expense','2026-10-20','completed','pending'),
  ('e0000000-0000-0000-0000-000000000002',:u1,:conta,null,'Despesa B', 80.00,'expense','2026-10-21','completed','pending'),
  ('e0000000-0000-0000-0000-000000000003',:u1,:conta,null,'Despesa C', 40.00,'expense','2026-10-22','completed','pending'),
  ('e0000000-0000-0000-0000-000000000004',:u2,:conta,null,'Despesa D', 10.00,'expense','2026-10-22','completed','pending'),
  ('e0000000-0000-0000-0000-000000000005',:u1,:conta,null,'Despesa E', 15.00,'expense','2026-10-23','completed','pending'),
  ('e0000000-0000-0000-0000-000000000006',:u1,:conta,null,'Despesa F', 25.00,'expense','2026-10-23','completed','pending'),
  -- PIX do extrato
  ('d0000000-0000-0000-0000-000000000001',:u1,:conta,null,
   'PIX TRANSF LUISA G02 11',552.00,'income','2026-11-03','completed',null),
  ('d0000000-0000-0000-0000-000000000002',:u1,:conta,'ca000000-0000-0000-0000-000000000003',
   'PIX já categorizado',     80.00,'income','2026-11-04','completed',null),
  ('d0000000-0000-0000-0000-000000000004',:u2,:conta,null,
   'PIX usuário sem categoria',10.00,'income','2026-11-04','completed',null),
  ('d0000000-0000-0000-0000-000000000005',:u1,:conta,null,
   'PIX do lote',             40.00,'income','2026-11-05','completed',null);
\set QUIET off

\echo ''
\echo '=== ANTES da migration: o PIX vinculado continua sem categoria ==='
select public.settle_reimbursement('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001') is not null as vinculou;
select 'Reembolsos Diversos (receita)' as esperado,
       coalesce(c.name || ' (' || c.type || ')', 'null') as obtido,
       case when t.category_id = 'ca000000-0000-0000-0000-000000000001' then 'ok'
            else 'FALHOU (defeito reproduzido)' end as veredito
  from public.transactions t left join public.categories c on c.id = t.category_id
 where t.id = 'd0000000-0000-0000-0000-000000000001';

\echo ''
\echo '=== aplicando a migration, sem modificar ==='
\i supabase/migrations/20261121120000_reembolso_recebe_categoria.sql

-- Volta ao estado inicial.
\set QUIET on
update public.transactions
   set reimbursement_status = 'pending', reimbursement_income_id = null, reimbursement_payment_id = null
 where id::text like 'e0000000%';
update public.transactions set is_reimbursement = false where id::text like 'd0000000%';
update public.transactions set category_id = null where id = 'd0000000-0000-0000-0000-000000000001';
\set QUIET off

\echo ''
\echo '### 1. vincular PIX SEM categoria: ganha "Reembolsos Diversos" de RECEITA (não a de despesa, mais antiga)'
select public.settle_reimbursement('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001') is not null as vinculou;
select 'ca...001 e is_reimbursement' as esperado,
       coalesce(t.category_id::text, 'null') || ' / ' || t.is_reimbursement as obtido,
       case when t.category_id = 'ca000000-0000-0000-0000-000000000001' and t.is_reimbursement
            then 'ok' else 'FALHOU' end as veredito
  from public.transactions t where t.id = 'd0000000-0000-0000-0000-000000000001';

\echo ''
\echo '### 2. vincular PIX JÁ categorizado: a categoria do usuário fica'
select public.settle_reimbursement('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002') is not null as vinculou;
select 'Salário (ca...003)' as esperado,
       coalesce(t.category_id::text, 'null') as obtido,
       case when t.category_id = 'ca000000-0000-0000-0000-000000000003' and t.is_reimbursement
            then 'ok' else 'FALHOU' end as veredito
  from public.transactions t where t.id = 'd0000000-0000-0000-0000-000000000002';

\echo ''
\echo '### 3. criar a receita numa conta: já nasce em "Reembolsos Diversos"'
select public.settle_reimbursement('e0000000-0000-0000-0000-000000000003', null, :conta, '2026-11-06') is not null as criou;
select 'ca...001' as esperado,
       coalesce(r.category_id::text, 'null') as obtido,
       case when r.category_id = 'ca000000-0000-0000-0000-000000000001' and r.is_reimbursement and r.type = 'income'
            then 'ok' else 'FALHOU' end as veredito
  from public.transactions d join public.transactions r on r.id = d.reimbursement_payment_id
 where d.id = 'e0000000-0000-0000-0000-000000000003';

\echo ''
\echo '### 4. usuário sem a categoria: quita normalmente e a receita fica sem categoria'
select public.settle_reimbursement('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004') is not null as vinculou;
select 'null e is_reimbursement' as esperado,
       coalesce(t.category_id::text, 'null') || ' / ' || t.is_reimbursement as obtido,
       case when t.category_id is null and t.is_reimbursement then 'ok' else 'FALHOU' end as veredito
  from public.transactions t where t.id = 'd0000000-0000-0000-0000-000000000004';

\echo ''
\echo '### 5. o lote (settle_reimbursements) herda a regra'
\i supabase/migrations/20261013120000_um_pix_quita_varias_despesas.sql
select public.settle_reimbursements(
  array['e0000000-0000-0000-0000-000000000005','e0000000-0000-0000-0000-000000000006']::uuid[],
  'd0000000-0000-0000-0000-000000000005');
select 'ca...001, 2 despesas apontando' as esperado,
       coalesce(t.category_id::text, 'null') || ', '
         || (select count(*) from public.transactions where reimbursement_income_id = t.id) || ' despesas apontando' as obtido,
       case when t.category_id = 'ca000000-0000-0000-0000-000000000001'
             and (select count(*) from public.transactions where reimbursement_income_id = t.id) = 2
            then 'ok' else 'FALHOU' end as veredito
  from public.transactions t where t.id = 'd0000000-0000-0000-0000-000000000005';

\echo ''
\echo '### 6. idempotência: quitar de novo não mexe na categoria escolhida depois'
update public.transactions set category_id = 'ca000000-0000-0000-0000-000000000003'
 where id = 'd0000000-0000-0000-0000-000000000001';
select public.settle_reimbursement('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001') is not null as repetiu;
select 'ca...003' as esperado,
       coalesce(t.category_id::text, 'null') as obtido,
       case when t.category_id = 'ca000000-0000-0000-0000-000000000003' then 'ok' else 'FALHOU' end as veredito
  from public.transactions t where t.id = 'd0000000-0000-0000-0000-000000000001';

-- Cenário do próprio cabeçalho da migration: um PIX de R$ 1.611,00 pagou duas
-- parcelas do mês — R$ 1.500,00 do empréstimo (parcela 3 de 5) e R$ 111,00 do
-- ingresso (parcela 2 de 4).
\set u '11111111-1111-1111-1111-111111111111'
\set grp_emp '22222222-2222-2222-2222-222222222222'
\set grp_ing '33333333-3333-3333-3333-333333333333'

insert into public.transactions (id, user_id, description, amount, type, date, status, is_provisional, installment_group_id, installment_number, total_installments, account_id)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', :'u', 'Empréstimo 3/5', 1500.00, 'expense', '2026-09-10', 'pending', true, :'grp_emp', 3, 5, 'cccccccc-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', :'u', 'Ingresso 2/4',    111.00, 'expense', '2026-09-10', 'pending', true, :'grp_ing', 2, 4, 'cccccccc-0000-0000-0000-000000000001'),
  -- As outras parcelas dos dois grupos, para medir o encolhimento.
  ('aaaaaaaa-0000-0000-0000-000000000003', :'u', 'Empréstimo 4/5', 1500.00, 'expense', '2026-10-10', 'pending', true, :'grp_emp', 4, 5, 'cccccccc-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000004', :'u', 'Ingresso 3/4',    111.00, 'expense', '2026-10-10', 'pending', true, :'grp_ing', 3, 4, 'cccccccc-0000-0000-0000-000000000001'),
  -- O PIX real, espelho manual da linha do extrato.
  ('bbbbbbbb-0000-0000-0000-000000000001', :'u', 'PIX ENVIADO', 1611.00, 'expense', '2026-09-12', 'completed', false, null, null, null, 'cccccccc-0000-0000-0000-000000000001');

\echo '=== ANTES: parcelas de cada grupo ==='
select installment_group_id, count(*) as parcelas, sum(amount) as total
  from public.transactions where installment_group_id is not null group by 1 order by 1;

\echo '=== quitar os dois previstos com o PIX ==='
select public.settle_transactions_with_payment(
  'bbbbbbbb-0000-0000-0000-000000000001',
  array['aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002']::uuid[]
) as grupo_criado;

select id, description, amount, status, split_group_id is not null as na_divisao, split_parent_id is null as eh_primaria
  from public.transactions where split_group_id is not null order by amount desc;

\echo '=== agora o usuário clica em "Desfazer divisão" (ícone roxo na lista) ==='
select public.unsplit_transaction('aaaaaaaa-0000-0000-0000-000000000001') as primaria;

\echo '=== DEPOIS: parcelas de cada grupo ==='
select installment_group_id, count(*) as parcelas, sum(amount) as total
  from public.transactions where installment_group_id is not null group by 1 order by 1;

\echo '=== o que sobrou ==='
select id, description, amount, installment_number, total_installments
  from public.transactions order by description;
\set QUIET on
truncate public.transactions cascade;
\set u '11111111-1111-1111-1111-111111111111'
\set QUIET off

\echo '### 1. REGRESSÃO: divisão COMUM continua apagando as partes e somando de volta'
insert into public.transactions (id, user_id, description, amount, type, date, status)
values ('dddddddd-0000-0000-0000-000000000001', :'u', 'Supermercado', 200.00, 'expense', '2026-09-01', 'completed');
select public.split_transaction('dddddddd-0000-0000-0000-000000000001',
  '[{"amount":120,"label":"comida"},{"amount":80,"label":"limpeza"}]'::jsonb) is not null as dividiu;
select count(*) as linhas_depois_da_divisao from public.transactions;
select public.unsplit_transaction('dddddddd-0000-0000-0000-000000000001') is not null as desfez;
select count(*) as linhas, sum(amount) as total, max(split_origin) is null as sem_marca
  from public.transactions;

\echo '### 2. TRAVA: alvo já quitado não pode ser quitado de novo'
truncate public.transactions cascade;
insert into public.transactions (id, user_id, description, amount, type, date, status, is_provisional)
values ('aaaaaaaa-0000-0000-0000-000000000001', :'u', 'Já pago', 100.00, 'expense', '2026-09-10', 'completed', false),
       ('bbbbbbbb-0000-0000-0000-000000000001', :'u', 'PIX', 100.00, 'expense', '2026-09-12', 'completed', false);
do $$
begin
  perform public.settle_transactions_with_payment('bbbbbbbb-0000-0000-0000-000000000001',
    array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]);
  raise notice 'FALHOU: deixou passar';
exception when others then raise notice 'recusou: %', sqlerrm;
end $$;
select count(*) as linhas_intactas from public.transactions;

\echo '### 3. TRAVA: pagamento pendente não pode quitar'
truncate public.transactions cascade;
insert into public.transactions (id, user_id, description, amount, type, date, status, is_provisional)
values ('aaaaaaaa-0000-0000-0000-000000000001', :'u', 'Previsto', 100.00, 'expense', '2026-09-10', 'pending', true),
       ('bbbbbbbb-0000-0000-0000-000000000001', :'u', 'PIX pendente', 100.00, 'expense', '2026-09-12', 'pending', false);
do $$
begin
  perform public.settle_transactions_with_payment('bbbbbbbb-0000-0000-0000-000000000001',
    array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]);
  raise notice 'FALHOU: deixou passar';
exception when others then raise notice 'recusou: %', sqlerrm;
end $$;

\echo '### 4. TRAVA: estorno apontando para o pagamento (que seria apagado)'
truncate public.transactions cascade;
insert into public.transactions (id, user_id, description, amount, type, date, status, is_provisional)
values ('aaaaaaaa-0000-0000-0000-000000000001', :'u', 'Previsto', 100.00, 'expense', '2026-09-10', 'pending', true),
       ('bbbbbbbb-0000-0000-0000-000000000001', :'u', 'PIX', 100.00, 'expense', '2026-09-12', 'completed', false);
insert into public.transactions (user_id, description, amount, type, date, status, is_refund, refunded_transaction_id)
values (:'u', 'Estorno do PIX', 100.00, 'expense', '2026-09-13', 'completed', true, 'bbbbbbbb-0000-0000-0000-000000000001');
do $$
begin
  perform public.settle_transactions_with_payment('bbbbbbbb-0000-0000-0000-000000000001',
    array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]);
  raise notice 'FALHOU: deixou passar';
exception when others then raise notice 'recusou: %', sqlerrm;
end $$;
select count(*) as estorno_nao_ficou_orfao from public.transactions where refunded_transaction_id is not null;

\echo '### 5. REDE RETROATIVA: grupo de quitação ANTERIOR à migration (sem split_origin)'
truncate public.transactions cascade;
insert into public.transactions (id, user_id, description, amount, type, date, status, installment_group_id, installment_number, total_installments, split_group_id, split_parent_id, split_origin)
values ('aaaaaaaa-0000-0000-0000-000000000001', :'u', 'Empréstimo 3/5', 1500.00, 'expense', '2026-09-12', 'completed', '22222222-2222-2222-2222-222222222222', 3, 5, '99999999-9999-9999-9999-999999999999', null, null),
       ('aaaaaaaa-0000-0000-0000-000000000002', :'u', 'Ingresso 2/4',    111.00, 'expense', '2026-09-12', 'completed', '33333333-3333-3333-3333-333333333333', 2, 4, '99999999-9999-9999-9999-999999999999', 'aaaaaaaa-0000-0000-0000-000000000001', null);
select public.unsplit_transaction('aaaaaaaa-0000-0000-0000-000000000001') is not null as desfez;
select count(*) as as_duas_sobreviveram, sum(amount) as total from public.transactions;

\echo '### 6. CATEGORIA: só o alvo SEM categoria herda a do pagamento'
truncate public.transactions cascade;
\set cat_pag 'eeeeeeee-0000-0000-0000-000000000001'
\set cat_alvo 'eeeeeeee-0000-0000-0000-000000000002'
insert into public.transactions (id, user_id, description, amount, type, date, status, is_provisional, category_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', :'u', 'Previsto sem categoria',  60.00, 'expense', '2026-09-10', 'pending', true, null),
       ('aaaaaaaa-0000-0000-0000-000000000002', :'u', 'Previsto já classificado', 40.00, 'expense', '2026-09-10', 'pending', true, :'cat_alvo'),
       ('bbbbbbbb-0000-0000-0000-000000000001', :'u', 'PIX classificado',       100.00, 'expense', '2026-09-12', 'completed', false, :'cat_pag');
select public.settle_transactions_with_payment('bbbbbbbb-0000-0000-0000-000000000001',
  array['aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002']::uuid[]) is not null as quitou;
-- herdou = o vazio recebeu a do pagamento; manteve = o classificado não foi tocado.
select description,
       category_id = :'cat_pag'::uuid  as ficou_com_a_do_pagamento,
       category_id = :'cat_alvo'::uuid as ficou_com_a_propria
  from public.transactions order by description;

\echo '### 7. CATEGORIA: pagamento sem categoria não apaga a do alvo'
truncate public.transactions cascade;
insert into public.transactions (id, user_id, description, amount, type, date, status, is_provisional, category_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', :'u', 'Previsto classificado', 100.00, 'expense', '2026-09-10', 'pending', true, :'cat_alvo'),
       ('bbbbbbbb-0000-0000-0000-000000000001', :'u', 'PIX sem categoria',     100.00, 'expense', '2026-09-12', 'completed', false, null);
select public.settle_transactions_with_payment('bbbbbbbb-0000-0000-0000-000000000001',
  array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]) is not null as quitou;
select description, category_id = :'cat_alvo'::uuid as manteve_a_propria from public.transactions;

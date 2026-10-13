-- Um PIX quita várias despesas (migration 20261013120000).
--
-- Rerrodável: limpa as próprias linhas no começo. Exige o schema.sql, a tabela
-- credit_cards e as migrations 20260531010000 (settle_reimbursement) e
-- 20260828120000_recompute_card_invoice já carregadas (ver README.md). Este
-- script APLICA a migration nova no meio (`\i`): o primeiro bloco precisa do
-- estado ANTERIOR a ela para reproduzir o defeito.
--
-- Cenário: o caso real que motivou a correção — três despesas corporativas no
-- cartão (93,90 + 573,10 + 86,58) devolvidas por um PIX único de 753,58 que já
-- estava na conta.

\set QUIET on
truncate public.transactions cascade;
truncate public.credit_cards cascade;

insert into public.credit_cards (id, user_id, name, current_invoice)
values ('cccc0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Itaú', 0);

insert into public.transactions
  (id, user_id, credit_card_id, account_id, description, amount, type, date, due_date,
   status, is_corporate_expense, reimbursement_status)
values
  ('e0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001',null,
   'Apple.com/bill',                 93.90,'expense','2026-08-14','2026-09-15','completed',true,'pending'),
  ('e0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001',null,
   'Il Barbuto - almoço WorkOn',    573.10,'expense','2026-08-10','2026-09-15','completed',true,'pending'),
  ('e0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001',null,
   'Santo Grao Patio Batel - Cafe',  86.58,'expense','2026-08-10','2026-09-15','completed',true,'pending'),
  ('d0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',null,'aaaa0000-0000-0000-0000-000000000001',
   'PIX TRANSF RAIZHE 15 09',       753.58,'income', '2026-09-15',null,        'completed',false,null);

select public.recompute_card_invoice('cccc0000-0000-0000-0000-000000000001');
\set QUIET off

\echo ''
\echo '=== ANTES da migration: reverter UMA despesa devolve o PIX inteiro às Receitas ==='

-- O caminho antigo deixa vincular o mesmo PIX duas vezes (uma chamada por despesa).
select public.settle_reimbursement('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001') is not null as vinculou_1;
select public.settle_reimbursement('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001') is not null as vinculou_2;
select public.unmark_reimbursed('e0000000-0000-0000-0000-000000000001', 'pending');

select 'true (a despesa 2 segue quitada por ele)' as esperado,
       is_reimbursement::text                     as obtido,
       case when is_reimbursement then 'ok' else 'FALHOU (defeito reproduzido)' end as veredito
  from public.transactions
 where id = 'd0000000-0000-0000-0000-000000000001';

\echo ''
\echo '=== aplicando a migration, sem modificar ==='
\i supabase/migrations/20261013120000_um_pix_quita_varias_despesas.sql

-- Volta ao estado inicial: nada quitado, PIX livre.
\set QUIET on
update public.transactions
   set reimbursement_status = 'pending', reimbursement_income_id = null, reimbursement_payment_id = null
 where id::text like 'e0000000%';
update public.transactions set is_reimbursement = false where id = 'd0000000-0000-0000-0000-000000000001';
\set QUIET off

\echo ''
\echo '### 1. o lote quita as três com o mesmo PIX, sem criar lançamento e sem mexer na fatura'

select public.settle_reimbursements(
  array['e0000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000000003']::uuid[],
  'd0000000-0000-0000-0000-000000000001');

select '3 quitadas, 3 apontando para o PIX' as esperado,
       count(*) filter (where reimbursement_status = 'reimbursed') || ' quitadas, '
         || count(*) filter (where reimbursement_income_id = 'd0000000-0000-0000-0000-000000000001')
         || ' apontando para o PIX' as obtido,
       case when count(*) filter (where reimbursement_status = 'reimbursed') = 3
             and count(*) filter (where reimbursement_income_id = 'd0000000-0000-0000-0000-000000000001') = 3
            then 'ok' else 'FALHOU' end as veredito
  from public.transactions
 where id::text like 'e0000000%';

select 'true' as esperado_pix_neutro, is_reimbursement::text as obtido,
       case when is_reimbursement then 'ok' else 'FALHOU' end as veredito
  from public.transactions where id = 'd0000000-0000-0000-0000-000000000001';

select '4 lançamentos, nenhum espelho' as esperado,
       count(*) || ' lançamentos, ' || count(*) filter (where is_card_payment) || ' espelho(s)' as obtido,
       case when count(*) = 4 and count(*) filter (where is_card_payment) = 0 then 'ok' else 'FALHOU' end as veredito
  from public.transactions;

select '753.58 (o banco cobrou a fatura cheia)' as esperado, current_invoice::text as obtido,
       case when current_invoice = 753.58 then 'ok' else 'FALHOU' end as veredito
  from public.credit_cards where id = 'cccc0000-0000-0000-0000-000000000001';

\echo ''
\echo '### 2. reverter UMA não solta o PIX que ainda quita as outras duas'

select public.unmark_reimbursed('e0000000-0000-0000-0000-000000000002', 'pending');

select 'true' as esperado, is_reimbursement::text as obtido,
       case when is_reimbursement then 'ok' else 'FALHOU' end as veredito
  from public.transactions where id = 'd0000000-0000-0000-0000-000000000001';

select 'pending, sem vínculo' as esperado,
       reimbursement_status || ', ' || coalesce(reimbursement_income_id::text, 'sem vínculo') as obtido,
       case when reimbursement_status = 'pending' and reimbursement_income_id is null then 'ok' else 'FALHOU' end as veredito
  from public.transactions where id = 'e0000000-0000-0000-0000-000000000002';

select 'PIX segue existindo' as esperado,
       case when exists (select 1 from public.transactions where id = 'd0000000-0000-0000-0000-000000000001')
            then 'PIX segue existindo' else 'APAGADO' end as obtido,
       case when exists (select 1 from public.transactions where id = 'd0000000-0000-0000-0000-000000000001')
            then 'ok' else 'FALHOU' end as veredito;

\echo ''
\echo '### 3. reverter a ÚLTIMA solta o PIX (volta a contar como receita)'

select public.unmark_reimbursed('e0000000-0000-0000-0000-000000000001', 'pending');
select 'true (ainda quita a 3)' as esperado, is_reimbursement::text as obtido,
       case when is_reimbursement then 'ok' else 'FALHOU' end as veredito
  from public.transactions where id = 'd0000000-0000-0000-0000-000000000001';

select public.unmark_reimbursed('e0000000-0000-0000-0000-000000000003', 'pending');
select 'false' as esperado, is_reimbursement::text as obtido,
       case when not is_reimbursement then 'ok' else 'FALHOU' end as veredito
  from public.transactions where id = 'd0000000-0000-0000-0000-000000000001';

\echo ''
\echo '### 4. tudo ou nada: um id inválido no lote não deixa as válidas quitadas'

do $$
begin
  perform public.settle_reimbursements(
    array['e0000000-0000-0000-0000-000000000001',
          'e0000000-0000-0000-0000-000000000002',
          'ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[],
    'd0000000-0000-0000-0000-000000000001');
  raise notice 'FALHOU: o lote com id inválido foi aceito';
exception when others then
  raise notice 'recusado como esperado: %', sqlerrm;
end $$;

select '0 quitadas, PIX livre' as esperado,
       (select count(*) from public.transactions where id::text like 'e0000000%' and reimbursement_status = 'reimbursed')
         || ' quitadas, PIX '
         || (select case when is_reimbursement then 'marcado' else 'livre' end
               from public.transactions where id = 'd0000000-0000-0000-0000-000000000001') as obtido,
       case when (select count(*) from public.transactions where id::text like 'e0000000%' and reimbursement_status = 'reimbursed') = 0
             and not (select is_reimbursement from public.transactions where id = 'd0000000-0000-0000-0000-000000000001')
            then 'ok' else 'FALHOU' end as veredito;

\echo ''
\echo '### 5. lote vazio é recusado'

do $$
begin
  perform public.settle_reimbursements(array[]::uuid[], 'd0000000-0000-0000-0000-000000000001');
  raise notice 'FALHOU: lote vazio aceito';
exception when others then
  raise notice 'recusado como esperado: %', sqlerrm;
end $$;

\echo ''
\echo '### 6. "criar receita" continua 1 para 1: cada despesa ganha a sua'

select public.settle_reimbursements(
  array['e0000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000003']::uuid[],
  null, 'aaaa0000-0000-0000-0000-000000000001', '2026-09-15');

select '2 receitas novas, valores 93.90 e 86.58, ambas neutras' as esperado,
       count(*) || ' receitas novas, valores ' || string_agg(amount::text, ' e ' order by amount desc)
         || case when bool_and(is_reimbursement) then ', ambas neutras' else ', NÃO neutras' end as obtido,
       case when count(*) = 2 and bool_and(is_reimbursement)
             and sum(amount) = 180.48 then 'ok' else 'FALHOU' end as veredito
  from public.transactions
 where id in (select reimbursement_payment_id from public.transactions where id::text like 'e0000000%');

select public.unmark_reimbursed('e0000000-0000-0000-0000-000000000001', 'pending');
select '1 receita criada restante' as esperado_so_a_da_despesa_3,
       count(*) || ' receita criada restante' as obtido,
       case when count(*) = 1 then 'ok' else 'FALHOU' end as veredito
  from public.transactions
 where description like 'Reembolso recebido - %';

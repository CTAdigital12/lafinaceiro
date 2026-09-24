-- B5: a descrição precisa voltar ao normal quando a divisão é desfeita.
--
-- Rerrodável: limpa as próprias linhas no começo. Exige o schema.sql e as
-- migrations de divisão já carregadas (ver README.md).
--
-- O primeiro bloco roda ANTES da migration e reproduz o defeito — é o que
-- prova que o teste mede alguma coisa.

truncate table public.transactions cascade;

\echo ''
\echo '=== ANTES da migration: o sufixo do rótulo fica grudado (é o B5) ==='

insert into public.transactions (id, user_id, description, amount, type, date, status)
values ('11111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-00000000000a',
        'Mercado', 250.00, 'expense', current_date, 'completed');

select public.split_transaction(
  '11111111-1111-1111-1111-111111111111',
  '[{"amount": 150.00, "label": "Comida"}, {"amount": 100.00, "label": "Bebida"}]'::jsonb
) is not null as dividiu;

select public.unsplit_transaction('11111111-1111-1111-1111-111111111111') is not null as desfez;

select 'Mercado'                           as esperado,
       description                         as obtido,
       case when description = 'Mercado'
            then 'ok' else 'FALHOU (defeito reproduzido)' end as veredito
  from public.transactions
 where id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '--- e ACUMULA: dividir e desfazer de novo empilha outro sufixo ---'

select public.split_transaction(
  '11111111-1111-1111-1111-111111111111',
  '[{"amount": 150.00, "label": "Comida"}, {"amount": 100.00, "label": "Bebida"}]'::jsonb
) is not null as dividiu_de_novo;
select public.unsplit_transaction('11111111-1111-1111-1111-111111111111') is not null as desfez_de_novo;

select description as depois_de_dois_ciclos
  from public.transactions
 where id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '=== aplicando a migration, sem modificar ==='
\i supabase/migrations/20260924120000_descricao_volta_ao_desfazer_divisao.sql

truncate table public.transactions cascade;

\echo ''
\echo '### 1. a descrição volta ao que era'

insert into public.transactions (id, user_id, description, amount, type, date, status)
values ('22222222-2222-2222-2222-222222222222',
        '00000000-0000-0000-0000-00000000000a',
        'Mercado', 250.00, 'expense', current_date, 'completed');

select public.split_transaction(
  '22222222-2222-2222-2222-222222222222',
  '[{"amount": 150.00, "label": "Comida"}, {"amount": 100.00, "label": "Bebida"}]'::jsonb
) is not null as dividiu;

select 'Mercado - Comida' as esperado_durante_a_divisao,
       description        as obtido,
       case when description = 'Mercado - Comida' then 'ok' else 'FALHOU' end as veredito
  from public.transactions
 where id = '22222222-2222-2222-2222-222222222222';

select public.unsplit_transaction('22222222-2222-2222-2222-222222222222') is not null as desfez;

select 'Mercado' as esperado,
       description as obtido,
       case when description = 'Mercado' then 'ok' else 'FALHOU' end as veredito
  from public.transactions
 where id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '### 2. a coluna não sobrevive ao grupo (não fica lixo para a próxima divisão)'

select 'nula' as esperado,
       coalesce(split_base_description, 'nula') as obtido,
       case when split_base_description is null then 'ok' else 'FALHOU' end as veredito
  from public.transactions
 where id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '### 3. não acumula mais: dois ciclos seguidos e a descrição segue limpa'

select public.split_transaction(
  '22222222-2222-2222-2222-222222222222',
  '[{"amount": 150.00, "label": "Comida"}, {"amount": 100.00, "label": "Bebida"}]'::jsonb
) is not null as dividiu_de_novo;
select public.unsplit_transaction('22222222-2222-2222-2222-222222222222') is not null as desfez_de_novo;

select 'Mercado' as esperado,
       description as obtido,
       case when description = 'Mercado' then 'ok' else 'FALHOU' end as veredito
  from public.transactions
 where id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '### 4. descrição que JÁ contém " - " é preservada inteira'
\echo '    (é o caso que proíbe consertar por recorte: a importação de fatura'
\echo '     grava "descrição - anotação")'

insert into public.transactions (id, user_id, description, amount, type, date, status)
values ('33333333-3333-3333-3333-333333333333',
        '00000000-0000-0000-0000-00000000000a',
        'UBER *TRIP - corrida do aeroporto', 80.00, 'expense', current_date, 'completed');

select public.split_transaction(
  '33333333-3333-3333-3333-333333333333',
  '[{"amount": 50.00, "label": "Ida"}, {"amount": 30.00, "label": "Volta"}]'::jsonb
) is not null as dividiu;
select public.unsplit_transaction('33333333-3333-3333-3333-333333333333') is not null as desfez;

select 'UBER *TRIP - corrida do aeroporto' as esperado,
       description as obtido,
       case when description = 'UBER *TRIP - corrida do aeroporto' then 'ok' else 'FALHOU' end as veredito
  from public.transactions
 where id = '33333333-3333-3333-3333-333333333333';

\echo ''
\echo '### 5. parte SEM rótulo: a descrição nunca muda, e desfazer não estraga'

insert into public.transactions (id, user_id, description, amount, type, date, status)
values ('44444444-4444-4444-4444-444444444444',
        '00000000-0000-0000-0000-00000000000a',
        'Condomínio', 900.00, 'expense', current_date, 'completed');

select public.split_transaction(
  '44444444-4444-4444-4444-444444444444',
  '[{"amount": 500.00}, {"amount": 400.00}]'::jsonb
) is not null as dividiu;
select public.unsplit_transaction('44444444-4444-4444-4444-444444444444') is not null as desfez;

select 'Condomínio' as esperado,
       description as obtido,
       case when description = 'Condomínio' then 'ok' else 'FALHOU' end as veredito
  from public.transactions
 where id = '44444444-4444-4444-4444-444444444444';

\echo ''
\echo '### 6. REGRESSÃO: o valor continua voltando somado e as partes são apagadas'

select 900.00 as esperado_valor,
       amount as obtido,
       case when amount = 900.00 then 'ok' else 'FALHOU' end as veredito,
       (select count(*) from public.transactions where split_group_id is not null) as ainda_em_divisao
  from public.transactions
 where id = '44444444-4444-4444-4444-444444444444';

-- Aporte em investimento: dividir um aporte não pode transformar parte dele em
-- despesa.
--
-- Rerrodável. Exige o schema.sql e as migrations de divisão já carregadas (ver
-- README.md). Aplica a própria migration no meio (`\i`): o primeiro bloco roda
-- ANTES dela e mostra que a coluna ainda não existe.

truncate table public.transactions cascade;

\echo ''
\echo '=== ANTES da migration: a coluna não existe ==='
select count(*) as colunas_aporte
  from information_schema.columns
 where table_name = 'transactions' and column_name = 'is_investment_contribution';

\echo ''
\echo '=== aplicando a migration, sem modificar ==='
\i supabase/migrations/20261120120000_aporte_em_investimento.sql

\echo ''
\echo '### 1. a parte nova herda a flag da original'

insert into public.transactions (id, user_id, description, amount, type, date, status,
                                 is_investment_contribution)
values ('33333333-3333-3333-3333-333333333333',
        '00000000-0000-0000-0000-00000000000a',
        'Capitalização', 300.00, 'expense', current_date, 'completed', true);

select public.split_transaction(
  '33333333-3333-3333-3333-333333333333',
  '[{"amount": 200.00, "label": "A"}, {"amount": 100.00, "label": "B"}]'::jsonb
) is not null as dividiu;

select count(*)                                          as partes,
       count(*) filter (where is_investment_contribution) as aportes,
       case when count(*) = 2 and count(*) filter (where is_investment_contribution) = 2
            then 'ok' else 'FALHOU' end                  as veredito
  from public.transactions
 where id = '33333333-3333-3333-3333-333333333333'
    or split_parent_id = '33333333-3333-3333-3333-333333333333';

\echo ''
\echo '### 2. despesa comum continua comum depois de dividida'

insert into public.transactions (id, user_id, description, amount, type, date, status)
values ('44444444-4444-4444-4444-444444444444',
        '00000000-0000-0000-0000-00000000000a',
        'Mercado', 250.00, 'expense', current_date, 'completed');

select public.split_transaction(
  '44444444-4444-4444-4444-444444444444',
  '[{"amount": 150.00, "label": "Comida"}, {"amount": 100.00, "label": "Bebida"}]'::jsonb
) is not null as dividiu;

select count(*) filter (where is_investment_contribution) as aportes,
       case when count(*) filter (where is_investment_contribution) = 0
            then 'ok' else 'FALHOU' end                  as veredito
  from public.transactions
 where id = '44444444-4444-4444-4444-444444444444'
    or split_parent_id = '44444444-4444-4444-4444-444444444444';

\echo ''
\echo '### 3. a regra de categorização ganhou a coluna, falsa por padrão'

insert into public.categorization_rules (user_id, keyword)
values ('00000000-0000-0000-0000-00000000000a', 'CAPITALIZ');

select is_investment_contribution as aporte,
       case when is_investment_contribution = false then 'ok' else 'FALHOU' end as veredito
  from public.categorization_rules
 where keyword = 'CAPITALIZ';

\echo ''
\echo '### 4. o banco aceita o tipo de ativo capitalizacao e continua recusando tipo desconhecido'

insert into public.investment_assets (user_id, name, asset_type)
values ('00000000-0000-0000-0000-00000000000a', 'PIC Itaú', 'capitalizacao');
select 'ok' as veredito_capitalizacao_aceita;

do $$
begin
  insert into public.investment_assets (user_id, name, asset_type)
  values ('00000000-0000-0000-0000-00000000000a', 'X', 'tipo_inventado');
  raise notice 'FALHOU: tipo desconhecido foi aceito';
exception when check_violation then
  raise notice 'ok: tipo desconhecido recusado (23514)';
end $$;

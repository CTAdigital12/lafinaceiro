-- Grupos de divisão que podem ter nascido de uma quitação e que o retroativo
-- da migration 20260825150000 NÃO alcançou.
--
-- O retroativo marca com segurança os grupos em que alguma parte secundária
-- tem `installment_group_id` — `split_transaction` nunca grava essa coluna nas
-- partes que insere, então ali é prova. Grupos de quitação SEM nenhuma parcela
-- envolvida não têm essa marca, e para eles não existe prova, só indício.
--
-- O indício mais forte: numa divisão comum, toda parte secundária tem descrição
-- derivada da primária (`<base> - <rótulo>`), porque foi a própria RPC que a
-- escreveu. Numa quitação, cada parte conserva a descrição que já tinha, sem
-- relação com as outras.
--
-- Rode isto no SQL Editor. Para cada grupo listado, decida olhando as
-- descrições e as datas se aquilo é um rateio de um gasto só (deixe como está)
-- ou lançamentos independentes quitados juntos (marque). O UPDATE está no fim,
-- comentado.
select
  t.split_group_id,
  count(*) filter (where t.split_parent_id is not null) as secundarias,
  -- SINAL: numa divisão comum a parte secundária foi INSERIDA pela RPC e nunca
  -- mais tocada, então `updated_at` = `created_at`. Numa quitação ela é um
  -- lançamento que já existia e foi ATUALIZADO para virar parte, então
  -- `updated_at` > `created_at`. Não é prova (uma edição posterior também
  -- atualiza), mas é o indício mais forte disponível.
  count(*) filter (
    where t.split_parent_id is not null and t.updated_at > t.created_at + interval '1 second'
  ) as secundarias_atualizadas,
  sum(t.amount) as total,
  min(t.date)   as data,
  string_agg(t.description, ' | ' order by t.split_parent_id nulls first) as descricoes
from public.transactions t
where t.split_group_id is not null
  and t.split_origin is null
group by t.split_group_id
order by secundarias_atualizadas desc, data desc;

-- Depois de decidir, para cada grupo que for de quitação:
--
-- update public.transactions
--    set split_origin = 'settle'
--  where split_group_id = '<cole o id aqui>';
--
-- Confira sempre com um SELECT depois: o SQL Editor do Supabase não imprime
-- "UPDATE n", só "Success. No rows returned".

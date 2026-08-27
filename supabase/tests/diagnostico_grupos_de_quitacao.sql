-- Grupos de divisão que podem ter nascido de uma quitação e que o retroativo
-- da migration 20260825150000 NÃO alcançou.
--
-- O retroativo marca com segurança os grupos em que alguma parte secundária
-- tem `installment_group_id` — `split_transaction` nunca grava essa coluna nas
-- partes que insere, então ali é prova. Grupos de quitação SEM nenhuma parcela
-- envolvida não têm essa marca, e para eles não existe prova: esta consulta
-- lista TODOS os grupos sem marca e dá dois indícios para você decidir.
--
-- NENHUM dos dois indícios é conclusivo sozinho. Medido nos dados reais em
-- 26/08/2026, sobre 6 grupos que eram TODOS divisão comum:
--
--   `secundarias_derivadas`  acertou 6 de 6.
--   `secundarias_atualizadas` deu 4 FALSOS POSITIVOS (partes editadas depois
--                             de criadas também mexem no updated_at).
--
-- Por isso a ordenação usa o primeiro. Olhe as descrições antes de marcar.
--
-- COMO LER:
--   secundarias_derivadas = secundarias  -> divisão comum. NÃO marque.
--   secundarias_derivadas < secundarias  -> candidato a quitação: alguma parte
--                                           tem descrição própria, sem relação
--                                           com a primária. Confirme na lista.
select
  t.split_group_id,
  count(*) filter (where t.split_parent_id is not null) as secundarias,
  -- INDÍCIO 1 (o bom): `split_transaction` escreve a descrição da parte como
  -- `<descrição da primária> - <rótulo>`, então numa divisão comum toda
  -- secundária começa com a descrição da primária. Na quitação cada parte
  -- conserva a sua, sem relação com as outras.
  count(*) filter (
    where t.split_parent_id is not null
      -- `starts_with` e não `like`: descrição de banco tem `_` e `%`, que o
      -- `like` trataria como curinga e faria casar o que não casa.
      and starts_with(t.description, (
        select p.description from public.transactions p
         where p.split_group_id = t.split_group_id and p.split_parent_id is null limit 1
      ))
  ) as secundarias_derivadas,
  -- INDÍCIO 2 (fraco, ver o cabeçalho): parte de divisão comum é INSERIDA e
  -- nunca mais tocada; parte de quitação já existia e foi ATUALIZADA. Só que
  -- qualquer edição posterior também atualiza, e foi o que aconteceu nos dados
  -- reais. Mantido como informação, não como critério.
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
order by (count(*) filter (where t.split_parent_id is not null)
          - count(*) filter (
              where t.split_parent_id is not null
                and starts_with(t.description, (
                  select p.description from public.transactions p
                   where p.split_group_id = t.split_group_id and p.split_parent_id is null limit 1
                ))
            )) desc,
         data desc;

-- Depois de decidir, para cada grupo que for de quitação:
--
-- update public.transactions
--    set split_origin = 'settle'
--  where split_group_id = '<cole o id aqui>';
--
-- Confira sempre com um SELECT depois: o SQL Editor do Supabase não imprime
-- "UPDATE n", só "Success. No rows returned".

-- Partes de uma MESMA divisão com `status` diferente entre si.
--
-- As partes nascem com o status do pai (a RPC `split_transaction` copia
-- `v_tx.status`), então a divisão sai coerente. O que desencaixa é a edição
-- DEPOIS: confirmar um lançamento atualiza por `id` e a irmã fica atrás.
--
-- Por que importa: o total da fatura só conta `status = 'completed'`
-- (`countsTowardInvoice` em src/lib/invoiceTotal.ts, espelhando o WHERE do
-- SQL), então a parte não confirmada SAI da fatura do ciclo — enquanto o banco
-- cobra a cobrança inteira. E a conciliação não acusa: ela SOMA as partes e
-- casa o valor cheio com a planilha.
--
-- Achado em 14/09/2026 no ciclo 09/2026 do Itaú Personnalité Black: parcela
-- 3/4 do Airbnb dividida em 688,48 `completed` + 425,24 `pending`. A fatura
-- marcava 9.143,35 contra 9.568,59 da planilha — exatamente os 425,24.
--
-- O código já não deixa acontecer de novo (propagação em `updateTransaction`,
-- regra em `sharedSplitFields`). Isto aqui é para o dado que já existe.
select
  t.split_group_id,
  count(*)                                            as partes,
  count(*) filter (where t.status = 'completed')       as completadas,
  count(*) filter (where t.status <> 'completed')      as nao_completadas,
  count(*) filter (where t.is_provisional)             as provisorias,
  sum(t.amount)                                       as total_da_cobranca,
  sum(t.amount) filter (where t.status <> 'completed') as fora_da_fatura,
  min(coalesce(t.due_date, t.date))                    as vencimento,
  string_agg(
    t.status || ' ' || to_char(t.amount, 'FM999999990.00') || ' ' || t.description,
    ' | ' order by t.split_parent_id nulls first
  )                                                   as detalhe
from public.transactions t
where t.split_group_id is not null
group by t.split_group_id
having count(distinct t.status) > 1
order by vencimento desc;

-- ---------------------------------------------------------------------------
-- CORREÇÃO
-- ---------------------------------------------------------------------------
-- Direção deliberada: se ALGUMA parte está `completed`, a cobrança aconteceu —
-- é uma linha só no extrato do banco — então todas ficam `completed`. O inverso
-- (propagar o `pending` da primária) desconfirmaria cobrança que já caiu.
-- Grupo com TODAS as partes pendentes é parcela futura legítima e não é tocado.
--
-- `is_reimbursable` e `reimbursement_status` ficam como estão: quem te deve a
-- parte é assunto de cada parte, e é o motivo de a divisão existir.

update public.transactions t
   set status = 'completed'
 where t.status <> 'completed'
   and t.split_group_id in (
     select split_group_id
       from public.transactions
      where split_group_id is not null
      group by split_group_id
     having count(distinct status) > 1
        and bool_or(status = 'completed')
   );

-- Confira DEPOIS: o SQL Editor do Supabase não imprime "UPDATE n", só
-- "Success. No rows returned". O primeiro select tem que voltar VAZIO.
--
-- E o grupo do Airbnb, linha a linha:
--
-- select id, status, amount, description
--   from public.transactions
--  where split_group_id = 'a49b021f-9827-478f-8b45-c2b7156d7b06'
--  order by split_parent_id nulls first;

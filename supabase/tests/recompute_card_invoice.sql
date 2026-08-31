-- Prova de que `recompute_card_invoice` faz exatamente o que faziam as duas
-- cópias do CASE embutidas em `mark_reimbursed` e `unmark_reimbursed`.
--
-- O método: para cada cenário, calcular pelo CASE ORIGINAL (transcrito aqui
-- literalmente, como estava nas migrations) e pela FUNÇÃO NOVA, e comparar.
-- Uma refatoração que muda resultado em qualquer linha aparece como `false`.
--
-- Rodar depois de carregar `schema.sql` mais a migration 20260828120000.

\set QUIET on
truncate public.transactions cascade;
truncate public.credit_cards cascade;
\set QUIET off

insert into public.credit_cards (id, user_id, name, current_invoice)
values ('cccc0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Itaú', 0);

-- Oito cenários, um por linha, cobrindo cada ramo do CASE e cada filtro do WHERE.
insert into public.transactions
  (user_id, credit_card_id, description, amount, type, date, status, is_provisional, is_refund, is_card_payment)
values
  ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001','compra comum',        200,'expense','2026-08-01','completed',false,false,false),
  ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001','estorno como despesa', 50,'expense','2026-08-02','completed',false,true, false),
  -- O caso do A10: estorno gravado como RECEITA. Só abate se `is_refund` for
  -- avaliado ANTES de `type`.
  ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001','estorno como receita', 30,'income', '2026-08-03','completed',false,true, false),
  ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001','pagamento da fatura',  40,'expense','2026-08-04','completed',false,false,true),
  -- `is_card_payment` decide antes de tudo, mesmo com is_refund junto.
  ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001','pagamento e estorno',  10,'income', '2026-08-05','completed',false,true, true),
  ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001','receita solta',       500,'income', '2026-08-06','completed',false,false,false),
  -- Os dois que o WHERE tira: pendente e provisória.
  ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001','parcela futura',      999,'expense','2026-09-01','pending',  false,false,false),
  ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-000000000001','provisória',          888,'expense','2026-08-07','completed',true, false,false);

\echo '=== 1. função nova x CASE original, sobre os 8 cenários ==='
with original as (
  -- Transcrição literal do que estava embutido nos dois RPCs.
  select greatest(0, coalesce(sum(
    case
      when is_card_payment then -amount
      when is_refund then -amount
      when type = 'expense' then amount
      else 0
    end), 0)) as total
  from public.transactions
  where credit_card_id = 'cccc0000-0000-0000-0000-000000000001'
    and is_provisional = false
    and status = 'completed'
)
select
  original.total                                                     as pelo_case_original,
  public.recompute_card_invoice('cccc0000-0000-0000-0000-000000000001') as pela_funcao_nova,
  original.total = public.recompute_card_invoice('cccc0000-0000-0000-0000-000000000001') as iguais
from original;

\echo '=== 2. grava mesmo em credit_cards, e não só devolve ==='
select current_invoice from public.credit_cards where id = 'cccc0000-0000-0000-0000-000000000001';

\echo '=== 3. o piso em zero (paridade com o TypeScript, achado M2) ==='
update public.transactions set amount = 5000
 where description = 'pagamento da fatura';
select public.recompute_card_invoice('cccc0000-0000-0000-0000-000000000001') as nunca_negativa;

\echo '=== 4. cartão sem transação nenhuma zera, não devolve nulo ==='
delete from public.transactions where credit_card_id = 'cccc0000-0000-0000-0000-000000000001';
select public.recompute_card_invoice('cccc0000-0000-0000-0000-000000000001') as zero;

\echo '=== 5. id nulo devolve nulo em vez de estourar ==='
select public.recompute_card_invoice(null) is null as trata_nulo;

-- ---------------------------------------------------------------------------
-- Ponta a ponta: os dois chamadores continuam recalculando a fatura
-- ---------------------------------------------------------------------------
\echo '=== 6. mark_reimbursed cria o espelho e abate a fatura ==='
truncate public.transactions cascade;
insert into public.transactions
  (id, user_id, credit_card_id, description, amount, type, date, due_date, status,
   is_provisional, is_reimbursable, reimbursement_status)
values ('dddd0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
        'cccc0000-0000-0000-0000-000000000001','Almoço do cliente',100,'expense',
        '2026-08-10','2026-09-05','completed',false,true,'pending');

select public.recompute_card_invoice('cccc0000-0000-0000-0000-000000000001') as antes_de_reembolsar;
select public.mark_reimbursed('dddd0000-0000-0000-0000-000000000001') is not null as criou_espelho;
select current_invoice as fatura_apos_reembolso from public.credit_cards
 where id = 'cccc0000-0000-0000-0000-000000000001';

\echo '=== 7. unmark_reimbursed apaga o espelho e a fatura volta ==='
select public.unmark_reimbursed('dddd0000-0000-0000-0000-000000000001', 'pending');
select current_invoice as fatura_apos_estornar from public.credit_cards
 where id = 'cccc0000-0000-0000-0000-000000000001';
select count(*) as espelhos_restantes from public.transactions where is_card_payment = true;

-- ---------------------------------------------------------------------------
-- DIVERGÊNCIA CONHECIDA, demonstrada e NÃO corrigida
-- ---------------------------------------------------------------------------
-- `useCreditCardInvoiceSync` (TypeScript) grava `status = 'open'` sempre que o
-- total fica positivo. Os RPCs não mexem em `status`. Então o mesmo evento
-- lógico — "a fatura voltou a ter saldo" — deixa o cartão em estados
-- diferentes conforme o caminho que rodou.
--
-- O cenário abaixo produz um cartão marcado "paid" devendo R$ 100,00.
--
-- Não foi corrigido aqui porque a migration 20260828120000 é refatoração pura,
-- e porque o comportamento certo não é óbvio: o TypeScript diz em comentário
-- que não rebaixa "closed", mas o código dele grava 'open' vindo de qualquer
-- status. Decidir isso é produto, não refatoração.
\echo '=== 8. DIVERGÊNCIA: fatura positiva com o cartão ainda marcado "paid" ==='
truncate public.transactions cascade;
insert into public.transactions
  (id, user_id, credit_card_id, description, amount, type, date, due_date, status,
   is_provisional, is_reimbursable, reimbursement_status)
values ('dddd0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
        'cccc0000-0000-0000-0000-000000000001','Almoço do cliente',100,'expense',
        '2026-08-10','2026-09-05','completed',false,true,'pending');
select public.mark_reimbursed('dddd0000-0000-0000-0000-000000000001') is not null as reembolsado;

-- O usuário paga a fatura (caminho do useCreditCards: zera e marca "paid").
update public.credit_cards set current_invoice = 0, status = 'paid'
 where id = 'cccc0000-0000-0000-0000-000000000001';

select public.unmark_reimbursed('dddd0000-0000-0000-0000-000000000001', 'pending');

select current_invoice, status,
       (current_invoice > 0 and status = 'paid') as incoerente
  from public.credit_cards where id = 'cccc0000-0000-0000-0000-000000000001';

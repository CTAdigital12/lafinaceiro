-- Conta única: os dois logins veem, alteram e apagam os mesmos dados.
--
-- O modelo de uso é CONTA ÚNICA (ver o cabeçalho de 20260817120000): `user_id`
-- só registra quem digitou a linha, não é fronteira de privacidade. As
-- policies, porém, tinham crescido aos pedaços e não seguiam isso. Em
-- 21/11/2026 (`pg_policies` de produção):
--
--   * DELETE era "só próprio" em TODAS as tabelas: o membro não conseguia
--     apagar um lançamento do dono, e vice-versa.
--   * credit_card_invoices e categorization_rules: SELECT "só próprio". O
--     membro não via as faturas nem as regras de categorização do dono.
--   * investment_*: UPDATE "só próprio". O membro via o investimento e não
--     conseguia corrigi-lo.
--
-- Junto com isto, o `shared_access` passou a existir nos dois sentidos (dado
-- aplicado à mão em 21/11/2026; `add-member` grava os dois para conta nova).
-- Sem o sentido de volta, o que o membro lançava ficava invisível para o dono:
-- o membro tinha 12 metas que não apareciam no Planejamento do dono.
--
-- O QUE MUDA: SELECT, UPDATE e DELETE passam a "próprio OU de quem compartilha
-- comigo" nas 12 tabelas abaixo. Cada tabela fica com uma policy permissiva
-- por comando, em vez das que havia (os nomes antigos variavam).
--
-- O QUE NÃO MUDA:
--   * INSERT continua "só próprio" (`user_id = auth.uid()`): a linha nova sai
--     sempre no nome de quem digitou, que é o que `user_id` quer dizer.
--   * As RESTRICTIVE `require_aal2` do A1 seguem por cima (AND): nada disto é
--     alcançável sem MFA.
--   * pluggy_items fica de fora: é o consentimento de UMA pessoa com o banco
--     dela (Open Finance), não um dado financeiro da conta.
--
-- O UPDATE leva o mesmo teste no WITH CHECK: dá para alterar a linha do outro,
-- mas não para entregá-la a um usuário que não compartilha com você.

do $$
declare
  alvo text;
  pol record;
  quem text;
  tabelas text[] := array[
    'accounts',
    'budgets',
    'categories',
    'categorization_rules',
    'credit_card_invoices',
    'credit_cards',
    'investment_assets',
    'investment_institutions',
    'investment_transactions',
    'projects',
    'recurring_rules',
    'transactions'
  ];
begin
  foreach alvo in array tabelas loop
    -- Derruba as PERMISSIVAS de SELECT/UPDATE/DELETE que existirem, pelo nome
    -- real no catálogo. INSERT e as RESTRICTIVE ficam intactas.
    for pol in
      select policyname
        from pg_policies
       where schemaname = 'public'
         and tablename = alvo
         and permissive = 'PERMISSIVE'
         and cmd in ('SELECT', 'UPDATE', 'DELETE')
    loop
      execute format('drop policy %I on public.%I', pol.policyname, alvo);
    end loop;

    -- `(select auth.uid())` vira InitPlan: avaliado uma vez por statement.
    quem := format($q$
      user_id = (select auth.uid())
      or exists (
        select 1 from public.shared_access s
         where s.owner_id = %I.user_id
           and s.shared_with_user_id = (select auth.uid())
      )
    $q$, alvo);

    execute format('create policy conta_unica_select on public.%I for select to authenticated using (%s)', alvo, quem);
    execute format('create policy conta_unica_update on public.%I for update to authenticated using (%s) with check (%s)', alvo, quem, quem);
    execute format('create policy conta_unica_delete on public.%I for delete to authenticated using (%s)', alvo, quem);
  end loop;
end $$;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rodar depois de aplicar). Esperado: 36 linhas conta_unica_*
-- (12 tabelas x 3 comandos) e, na 2ª consulta, 12 linhas de INSERT intactas.
-- ---------------------------------------------------------------------------
--
-- select tablename, cmd, policyname from pg_policies
--  where schemaname = 'public' and policyname like 'conta_unica_%'
--  order by tablename, cmd;
--
-- select tablename, policyname from pg_policies
--  where schemaname = 'public' and permissive = 'PERMISSIVE' and cmd = 'INSERT'
--    and tablename in ('accounts','budgets','categories','categorization_rules',
--      'credit_card_invoices','credit_cards','investment_assets','investment_institutions',
--      'investment_transactions','projects','recurring_rules','transactions');


-- ---------------------------------------------------------------------------
-- ROLLBACK — volta ao "só próprio" em tudo (mais restrito que o estado
-- anterior, que era misto; é o lado seguro). Colar no SQL Editor.
-- ---------------------------------------------------------------------------
--
-- do $$
-- declare alvo text;
-- begin
--   foreach alvo in array array['accounts','budgets','categories','categorization_rules',
--     'credit_card_invoices','credit_cards','investment_assets','investment_institutions',
--     'investment_transactions','projects','recurring_rules','transactions'] loop
--     execute format('drop policy if exists conta_unica_select on public.%I', alvo);
--     execute format('drop policy if exists conta_unica_update on public.%I', alvo);
--     execute format('drop policy if exists conta_unica_delete on public.%I', alvo);
--     execute format('create policy proprio_select on public.%I for select using (user_id = auth.uid())', alvo);
--     execute format('create policy proprio_update on public.%I for update using (user_id = auth.uid())', alvo);
--     execute format('create policy proprio_delete on public.%I for delete using (user_id = auth.uid())', alvo);
--   end loop;
-- end $$;

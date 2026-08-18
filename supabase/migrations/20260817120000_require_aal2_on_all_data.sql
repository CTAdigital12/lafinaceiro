-- A1 — MFA passa a ser exigido pelo BANCO, não só pela UI.
--
-- Problema: o único portão de MFA era o redirect em MainLayout.tsx. Nenhuma
-- policy checava o AAL do token, então uma sessão AAL1 (autenticada, mas sem
-- ter passado pelo TOTP) lia e escrevia tudo direto pelo PostgREST, bastando
-- o access_token. O MFA protegia a tela, não o dado.
--
-- REGRA: acesso a dado exige AAL2, para todo mundo, sem exceção.
--
-- O modelo de uso é CONTA ÚNICA: as duas pessoas com login enxergam o mesmo
-- conjunto de finanças, e a coluna `user_id` só registra quem digitou a linha
-- — não é uma fronteira de privacidade entre elas. Por isso não faz sentido
-- condicionar a exigência ao MFA de quem lê nem ao dono da linha: qualquer
-- linha lida com senha apenas é o mesmo vazamento. Foram consideradas e
-- descartadas duas variantes mais brandas:
--
--   (a) exigir AAL2 só de quem tem fator verificado — deixava os dados
--       alcançáveis pela conta sem MFA;
--   (b) exigir AAL2 também quando o DONO da linha tem MFA — ainda deixava de
--       fora as linhas gravadas pela conta sem MFA, que neste modelo são
--       dados do casal do mesmo jeito.
--
-- CONSEQUÊNCIA OPERACIONAL: toda conta sem MFA cadastrado perde acesso aos
-- dados no instante em que isto for aplicado, e só recupera após cadastrar um
-- autenticador. Isso é intencional, mas precisa ser combinado antes.
--
-- Não há deadlock: `/settings/security` (SecuritySettings.tsx + o wizard de
-- cadastro) não lê nenhuma tabela sob RLS — o cadastro do fator passa pela API
-- de auth e os códigos de recuperação por edge function com service role. E o
-- MainLayout só redireciona para o desafio quem JÁ tem fator, então quem não
-- tem continua navegando até a tela de cadastro.
--
-- Desenho: policies RESTRICTIVE, que o Postgres combina com AND por cima das
-- permissivas existentes. Nenhuma das 66 policies atuais é tocada — só ganham
-- uma condição a mais. Em 16/08/2026 não havia nenhuma policy RESTRICTIVE no
-- schema, então estas são as primeiras e não há interação com nada.
--
-- Fora do escopo, de propósito:
--   audit_logs, mfa_attempts, mfa_recovery_codes — pertencem à própria
--   maquinaria de elevação e/ou só têm SELECT restrito a admin. Prendê-las
--   atrás de aal2 mistura o portão com a chave.
--
-- ROLLBACK: ver o bloco no fim deste arquivo.

do $$
declare
  alvo text;
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
    'invitations',
    'pluggy_items',
    'profiles',
    'projects',
    'recurring_rules',
    'shared_access',
    'transactions'
  ];
begin
  foreach alvo in array tabelas loop
    execute format(
      'drop policy if exists require_aal2 on public.%I',
      alvo
    );

    -- USING cobre SELECT/UPDATE/DELETE (linha visível);
    -- WITH CHECK cobre INSERT/UPDATE (linha resultante). Os dois são
    -- necessários: só USING deixaria o INSERT passar em AAL1.
    --
    -- O `(select ...)` faz o Postgres avaliar isto uma vez por statement
    -- (InitPlan) em vez de uma vez por linha — importante em `transactions`,
    -- que é a tabela grande e ainda não tem índices (M8).
    execute format($f$
      create policy require_aal2
        on public.%I
        as restrictive
        for all
        to authenticated
        using      ((select auth.jwt() ->> 'aal') = 'aal2')
        with check ((select auth.jwt() ->> 'aal') = 'aal2')
    $f$, alvo);
  end loop;
end $$;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rodar depois de aplicar; deve devolver 16 linhas RESTRICTIVE)
-- ---------------------------------------------------------------------------
--
-- select tablename, policyname, permissive, cmd
--   from pg_policies
--  where schemaname = 'public'
--    and policyname = 'require_aal2'
--  order by tablename;


-- ---------------------------------------------------------------------------
-- ROLLBACK — colar no SQL Editor se algo travar.
--
-- Funciona mesmo com o app inutilizável, porque não depende do app. O modo de
-- falha desta migration é PERDER ACESSO ao dado, nunca perder o dado.
-- ---------------------------------------------------------------------------
--
-- do $$
-- declare
--   alvo text;
-- begin
--   foreach alvo in array array[
--     'accounts','budgets','categories','categorization_rules',
--     'credit_card_invoices','credit_cards','investment_assets',
--     'investment_institutions','investment_transactions','invitations',
--     'pluggy_items','profiles','projects','recurring_rules',
--     'shared_access','transactions'
--   ] loop
--     execute format('drop policy if exists require_aal2 on public.%I', alvo);
--   end loop;
-- end $$;
--
-- notify pgrst, 'reload schema';

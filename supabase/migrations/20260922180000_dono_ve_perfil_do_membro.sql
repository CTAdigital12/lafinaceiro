-- M4 — a lista de membros nunca mostrou nome nem e-mail.
--
-- `useMembers` lê `shared_access` (que o dono enxerga) e, para cada linha, o
-- `profiles` do convidado. Mas a única policy de SELECT em `profiles` é
-- `auth.uid() = id` (migration 20251231182014, linha 89): o dono só pode ler o
-- PRÓPRIO perfil. A consulta do convidado sempre voltou vazia, o `maybeSingle`
-- transformou isso em `null` sem erro nenhum, e a tela mostra "Usuário" com a
-- linha do e-mail em branco para todo mundo — sem nada indicando que faltou
-- permissão. Falha silenciosa: não há toast, não há erro no console.
--
-- Correção: uma policy PERMISSIVE de SELECT a mais, que libera exatamente os
-- perfis de quem o próprio `auth.uid()` convidou.
--
-- Por que isto não afrouxa o modelo de segurança:
--
--   * O alcance é a pessoa a quem o dono JÁ concedeu acesso à conta inteira.
--     No modelo de CONTA ÚNICA deste app (ver o cabeçalho do A1), essa pessoa
--     já enxerga todas as finanças; nome e e-mail dela não são um degrau novo.
--   * `profiles` está na lista das 16 tabelas com a policy RESTRICTIVE
--     `require_aal2` (migration 20260817120000, linha 60). RESTRICTIVE combina
--     com AND, então esta permissiva NÃO abre caminho para sessão AAL1 — o
--     portão de MFA continua valendo. Há teste cobrindo exatamente isso.
--   * É só SELECT. O dono não pode alterar o perfil de ninguém.
--   * `to authenticated`, igual às restritivas do A1: para `anon` o
--     `auth.uid()` é nulo e o EXISTS nunca casa, mas não custa ser explícito.
--   * Sem recursão: a policy de `profiles` consulta `shared_access`, cujas
--     policies olham só `auth.uid()` e não voltam a `profiles`.
--
-- DELIBERADAMENTE FORA: o caminho inverso (o convidado ver o perfil do dono).
-- Nenhuma tela pede — `MembersSection` lista membros para quem é dono, e um
-- convidado consultando `shared_access` por `owner_id = auth.uid()` recebe
-- lista vazia. Correção mínima; se algum dia aparecer a tela, é outra policy.
--
-- Revogar o acesso volta a esconder o perfil na mesma hora: a policy é
-- avaliada por consulta, e a linha de `shared_access` deixou de existir.

create policy "Owners can view profiles of their members"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.shared_access sa
       where sa.shared_with_user_id = profiles.id
         and sa.owner_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rodar depois de aplicar; deve devolver 2 linhas)
-- ---------------------------------------------------------------------------
--
-- select policyname, permissive, cmd
--   from pg_policies
--  where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
--  order by policyname;


-- ---------------------------------------------------------------------------
-- ROLLBACK — colar no SQL Editor se algo travar.
--
-- drop policy if exists "Owners can view profiles of their members"
--   on public.profiles;
-- notify pgrst, 'reload schema';
--
-- O modo de falha desta migration é a lista de membros continuar vazia como
-- hoje. Nenhum dado é escrito, nenhum acesso a dado financeiro muda.

-- Fecha um buraco latente na tabela `invitations`.
--
-- A policy criada em 20260102014046 era:
--
--   CREATE POLICY "Invited users can update invitation status"
--     ON public.invitations FOR UPDATE
--     USING (auth.email() = invited_email OR auth.uid() = invited_user_id);
--
-- Ela declara só USING. No Postgres, quando o WITH CHECK é omitido num UPDATE,
-- a expressão do USING é reaproveitada como WITH CHECK — e o USING olha para
-- `invited_email`/`invited_user_id`, nunca para `owner_id`. Resultado: o
-- convidado podia reescrever o `owner_id` do próprio convite e continuar
-- passando na checagem, porque o e-mail convidado seguia sendo o dele.
--
-- Hoje isso não concede nada, porque quem insere em `shared_access` é só o
-- dono (WITH CHECK (auth.uid() = owner_id)) — o convidado nunca consegue
-- transformar o convite adulterado em acesso. Mas bastaria alguém ligar um
-- fluxo de aceite sem reler esta policy para virar escalação: sou convidado
-- por A, aponto o convite para B, aceito, leio os dados de B.
--
-- Nenhum código usa `invitations`. O hook `src/hooks/useInvitations.ts`, que
-- era o único candidato a usá-la, nunca foi importado por componente algum e
-- foi removido no mesmo commit desta migration — ele também não funcionaria:
-- seu passo de aceite inseria em `shared_access` com `owner_id` de outra
-- pessoa e batia na RLS.
--
-- Por isso a policy é DERRUBADA em vez de corrigida. Não há caminho vivo que
-- precise atualizar um convite, e uma policy permissiva sem chamador é
-- superfície de ataque sem contrapartida. Quem for reviver o fluxo de convite
-- um dia precisa escrever a policy de propósito, com WITH CHECK explícito
-- fixando `owner_id` e `invited_email`, e não herdar esta por descuido.
--
-- A tabela e as demais policies (SELECT/INSERT/DELETE, todas corretas) ficam
-- de pé: a tabela pode ter linhas e não cabe a esta migration apagar dado.

drop policy if exists "Invited users can update invitation status" on public.invitations;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rodar depois de aplicar)
--
-- Deve devolver as 4 policies restantes e NENHUMA com cmd = 'UPDATE':
--
--   select policyname, cmd, permissive
--     from pg_policies
--    where schemaname = 'public' and tablename = 'invitations'
--    order by cmd, policyname;
--
-- A RESTRICTIVE `require_aal2` de 20260817120000 também cobre esta tabela e
-- continua valendo; ela não é tocada aqui.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- ROLLBACK — recria a policy exatamente como estava (com o defeito).
--
-- create policy "Invited users can update invitation status"
--   on public.invitations for update
--   using (auth.email() = invited_email or auth.uid() = invited_user_id);
-- ---------------------------------------------------------------------------

-- Remove a RPC `add_shared_access_by_email`, que era uma porta de persistência
-- capaz de anular o A1.
--
-- A função era SECURITY DEFINER e nunca teve GRANT/REVOKE explícito — e o
-- padrão do Postgres é EXECUTE para PUBLIC. Como nenhuma tabela usa FORCE ROW
-- LEVEL SECURITY, uma função SECURITY DEFINER roda como dona das tabelas e
-- ignora RLS por completo, inclusive as policies de `aal2` criadas em
-- 20260817120000_require_aal2_on_all_data.sql.
--
-- O ataque que isso permitia: de posse de um token AAL1 — que depois do A1 não
-- lê nada — bastava chamar
--
--     POST /rest/v1/rpc/add_shared_access_by_email {"target_email": "..."}
--
-- para inserir uma linha em `shared_access` dando à conta escolhida acesso
-- PERMANENTE aos dados do titular. Esse acesso sobrevive à troca de senha, à
-- expiração do token e ao MFA, porque a partir daí o atacante lê autenticado
-- como ele mesmo.
--
-- A função já era código morto do ponto de vista da interface: o único
-- chamador era `useMembers.addMember`, que nenhum componente usava (removido
-- no mesmo commit). O caminho vivo de adicionar membro é a edge function
-- `add-member`, que NÃO usa esta RPC.
--
-- Não há substituto aqui de propósito: exigir aceite do convidado antes de
-- criar `shared_access` é o próximo PR. Esta migration só fecha a porta.
--
-- A definição original está em
-- supabase/migrations/20260210012220_6145e176-084a-4999-a0d1-b5372116d804.sql
-- caso algum dia seja preciso consultá-la. Recriá-la reabriria o buraco.

-- Só o DROP: um `revoke` numa função já inexistente dá erro e tornaria esta
-- migration não-idempotente. O `if exists` deixa rodar duas vezes sem quebrar.
drop function if exists public.add_shared_access_by_email(text);

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rodar depois de aplicar; deve devolver ZERO linhas)
-- ---------------------------------------------------------------------------
--
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname = 'add_shared_access_by_email';

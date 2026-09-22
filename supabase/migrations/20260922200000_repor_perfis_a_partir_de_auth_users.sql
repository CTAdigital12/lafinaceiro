-- Os dois perfis sumiram do banco, e nada no app pode ter apagado.
--
-- Descoberto em 22/09/2026, ao aplicar a policy do M4 (20260922180000) e a
-- lista de membros continuar dizendo "Membro sem perfil": `public.profiles`
-- estava VAZIA para as duas contas — inclusive a do dono.
--
-- As linhas EXISTIRAM. O gatilho `on_auth_user_created` insere o perfil e as
-- categorias padrão na MESMA transação; as duas contas têm categorias (96 e
-- 12), então o insert do perfil passou. Foram apagadas depois.
--
-- Não foi o aplicativo: `profiles` não tem nenhuma policy de DELETE, então
-- nenhuma sessão autenticada consegue apagar; as únicas referências à tabela no
-- código são duas LEITURAS (`useMembers` e a edge function `add-member`); e
-- nenhuma migration a derruba ou limpa. Resta ação manual (SQL Editor ou editor
-- de tabelas do painel), que não dá para provar em retrospecto.
--
-- O que isso quebrou, além da lista de membros:
--   * `add-member` procura o convidado em `profiles` pelo e-mail. Sem a linha,
--     ninguém é encontrado, a função cai no ramo "criar conta" e o
--     `createUser` falha porque o e-mail já existe em `auth.users` — com a
--     mensagem "Erro ao criar usuário", que não aponta para a causa.
--
-- Esta migration REPÕE o que o gatilho teria criado, lendo de `auth.users`, que
-- é a fonte da verdade. Idempotente: roda quantas vezes for preciso e só toca
-- em quem não tem perfil.
--
-- `full_name` vem de `raw_user_meta_data` e provavelmente será nulo para conta
-- criada pelo admin — a tela cai para o e-mail, que é o que o M4 queria mostrar.

insert into public.profiles (id, email, full_name)
select u.id,
       u.email,
       u.raw_user_meta_data ->> 'full_name'
  from auth.users u
 where not exists (
         select 1 from public.profiles p where p.id = u.id
       );


-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rodar depois; `sem_perfil` tem que ser 0)
-- ---------------------------------------------------------------------------
--
-- select count(*) filter (where p.id is null) as sem_perfil,
--        count(*)                             as contas
--   from auth.users u
--   left join public.profiles p on p.id = u.id;


-- ---------------------------------------------------------------------------
-- SEM ROLLBACK, de propósito.
--
-- Desfazer seria apagar perfil de novo, que é exatamente o estado defeituoso.
-- Se alguma linha vier errada, corrija com UPDATE — não com DELETE.



# Acesso imediato ao adicionar usuario por e-mail

## Resumo

Substituir o fluxo atual de convite (criar convite -> usuario aceita) por um fluxo direto: ao digitar o e-mail, o acesso e concedido imediatamente. O sistema vai buscar o usuario pelo e-mail no banco e criar o registro de acesso compartilhado na hora.

## Problema tecnico

A tabela `profiles` tem RLS que so permite cada usuario ver seu proprio perfil. Entao nao e possivel buscar outro usuario pelo e-mail diretamente do frontend. Precisamos de uma funcao no banco de dados para fazer essa busca de forma segura.

## Etapas

### 1. Criar funcao no banco de dados

Uma funcao `add_shared_access_by_email` que:
- Recebe o e-mail do usuario a ser adicionado
- Busca o `id` na tabela `profiles` pelo e-mail
- Retorna erro se o e-mail nao for encontrado (usuario nao cadastrado)
- Retorna erro se o acesso ja existir
- Cria o registro na tabela `shared_access` automaticamente
- Usa `SECURITY DEFINER` para poder consultar profiles de outros usuarios

### 2. Simplificar o hook `useInvitations`

- Remover as funcoes de convite (createInvitation, acceptInvitation, rejectInvitation, deleteInvitation)
- Remover as queries de convites enviados e recebidos
- Adicionar uma mutation `addMember` que chama a funcao RPC `add_shared_access_by_email`
- Manter a query de membros ativos e a funcao `revokeAccess`

### 3. Simplificar o componente `MembersSection`

- Remover a secao de "Convites recebidos"
- Remover a secao de "Convites pendentes"
- Remover o dialog de confirmacao de cancelar convite
- Manter o formulario de adicionar membro (agora com acao imediata)
- Manter a lista de membros ativos com opcao de revogar
- Atualizar mensagens de feedback (ex: "Membro adicionado!" em vez de "Convite enviado!")

## Detalhes tecnicos

```sql
-- Funcao para adicionar acesso compartilhado por e-mail
CREATE OR REPLACE FUNCTION public.add_shared_access_by_email(target_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  new_access_id uuid;
BEGIN
  -- Buscar usuario pelo e-mail
  SELECT id INTO target_user_id FROM profiles WHERE email = target_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario com este e-mail nao encontrado';
  END IF;
  
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Voce nao pode adicionar a si mesmo';
  END IF;
  
  -- Verificar se ja tem acesso
  IF EXISTS (
    SELECT 1 FROM shared_access 
    WHERE owner_id = auth.uid() AND shared_with_user_id = target_user_id
  ) THEN
    RAISE EXCEPTION 'Este usuario ja tem acesso';
  END IF;
  
  -- Criar acesso
  INSERT INTO shared_access (owner_id, shared_with_user_id)
  VALUES (auth.uid(), target_user_id)
  RETURNING id INTO new_access_id;
  
  RETURN new_access_id;
END;
$$;
```

A tabela `invitations` permanece no banco (sem alteracoes destrutivas), mas deixa de ser utilizada pelo sistema.


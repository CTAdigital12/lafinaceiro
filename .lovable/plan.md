
# Criar senha para usuario pelo admin

## Problema
O e-mail de recuperacao de senha nao chegou para o membro. Voce precisa de uma forma de definir a senha de um usuario diretamente, sem depender do e-mail.

## Solucao
Criar uma edge function que usa a API Admin do Supabase (com service role key) para atualizar a senha de um usuario pelo e-mail. Na interface de Membros, adicionar um botao "Redefinir Senha" ao lado de cada membro ativo, que abre um modal para digitar a nova senha.

## Alteracoes

### 1. Edge Function `admin-reset-password`

Criar `supabase/functions/admin-reset-password/index.ts`:
- Recebe `{ email, newPassword }` via POST
- Valida que o usuario autenticado e o dono (owner) do shared_access daquele email
- Busca o user_id pelo email na tabela profiles
- Usa `supabase.auth.admin.updateUserById()` com o service role key para definir a nova senha
- Retorna sucesso ou erro

### 2. Componente `MembersSection.tsx`

- Adicionar um botao de "chave" (KeyRound icon) ao lado de cada membro na lista
- Ao clicar, abre um dialog simples com:
  - Campo "Nova Senha" (minimo 6 caracteres)
  - Campo "Confirmar Senha"
  - Botao "Salvar"
- Ao confirmar, chama a edge function `admin-reset-password` com o email do membro e a nova senha
- Mostra toast de sucesso ou erro

### Detalhes tecnicos

**Edge function:**
```typescript
// Valida ownership: verifica se o caller tem shared_access com o target user
// Usa SUPABASE_SERVICE_ROLE_KEY para chamar auth.admin.updateUserById
// Isso permite redefinir a senha sem enviar e-mail
```

**Seguranca:**
- A edge function valida que o usuario autenticado e realmente o owner do membro alvo
- Usa service role key apenas no servidor (edge function), nunca no cliente
- Senha minima de 6 caracteres validada no cliente e no servidor

**UI no MembersSection:**
- Novo icone KeyRound ao lado do botao de remover membro
- Dialog com dois campos de senha e validacao de match
- Loading state durante a chamada

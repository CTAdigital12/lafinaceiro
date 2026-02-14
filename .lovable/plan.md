
# Permitir que usuários compartilhados atualizem transações

## Problema
Luísa (luisaguarezi@gmail.com) é uma usuária compartilhada que tem acesso de leitura às transações do proprietário (aesdomingues@gmail.com). Porém, a política de segurança (RLS) da tabela `transactions` só permite UPDATE quando `auth.uid() = user_id` -- ou seja, apenas o dono pode editar.

Isso impede Luísa de:
- Mudar categorias de transações
- Editar qualquer campo de transações
- Categorizar despesas sem categoria na tela de Planejamento

## Solução
Atualizar a política RLS de UPDATE da tabela `transactions` para permitir que usuários com acesso compartilhado também possam editar transações do proprietário.

A mesma lógica já é usada na política de SELECT -- basta replicar para UPDATE.

## Escopo da mudança
Além de `transactions`, as mesmas restrições existem em outras tabelas que Luísa pode precisar editar:
- `categories` (UPDATE restrito ao dono)
- `accounts` (UPDATE restrito ao dono)
- `credit_cards` (UPDATE restrito ao dono)
- `budgets` (UPDATE restrito ao dono)
- `credit_card_invoices` (UPDATE restrito ao dono)

Vou atualizar as políticas de UPDATE de todas essas tabelas para incluir acesso compartilhado, garantindo que Luísa possa operar normalmente.

## Seção técnica

### Migração SQL
Para cada tabela, substituir a política de UPDATE existente por uma que inclua shared_access:

```text
-- transactions
DROP POLICY "Users can update own transactions" ON transactions;
CREATE POLICY "Users can update own or shared transactions" ON transactions
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_access.shared_with_user_id = auth.uid() 
      AND shared_access.owner_id = transactions.user_id
    )
  );
```

O mesmo padrão para: `categories`, `accounts`, `credit_cards`, `budgets`, `credit_card_invoices`.

Nenhuma alteração de código necessária -- o problema é exclusivamente na camada de permissões do banco de dados.



# Correção: Erro de RLS ao Criar Transação

## Problema Identificado

Ao tentar criar uma transação, o erro **"new row violates row-level security policy for table 'transactions'"** ocorre porque o código envia `user_id: undefined` quando o contexto de autenticação não está sincronizado.

### Causa Raiz

Em `src/hooks/useTransactions.ts` (linha 132), o código usa:

```typescript
user_id: user?.id
```

Se `user` for `undefined` (sessão expirada, erro de sincronização, etc.), o Supabase recebe `user_id: undefined` que não corresponde ao `auth.uid()` exigido pela política RLS de INSERT.

O mesmo problema existe em 8 outros hooks que também usam `user?.id` sem validação prévia.

---

## Solução

Adicionar verificação de autenticação antes de qualquer operação de INSERT em todos os hooks afetados.

### Arquivos a Modificar

| Arquivo | Mutations Afetadas |
|---------|-------------------|
| `src/hooks/useTransactions.ts` | createTransaction |
| `src/hooks/useCategories.ts` | createCategory |
| `src/hooks/useAccounts.ts` | createAccount |
| `src/hooks/useCreditCards.ts` | createCard, payInvoice |
| `src/hooks/useBudgets.ts` | createBudget |
| `src/hooks/useInvestments.ts` | createAsset, createTransaction |
| `src/hooks/useInstitutions.ts` | createInstitution |
| `src/hooks/useCategorizationRules.ts` | createRule |
| `src/hooks/useInvitations.ts` | acceptInvitation |

---

## Implementação Detalhada

### 1. `src/hooks/useTransactions.ts`

Adicionar verificação no início da mutation `createTransaction`:

```typescript
const createTransaction = useMutation({
  mutationFn: async (transaction: ...) => {
    // Adicionar esta verificação
    if (!user?.id) {
      throw new Error("Usuário não autenticado");
    }
    
    const { silent, ...transactionData } = transaction;
    const sanitizedTransaction = {
      ...transactionData,
      user_id: user.id, // Agora seguro, sem operador opcional
      // ... resto do código
    };
```

### 2. Aplicar o mesmo padrão em todos os hooks

Para cada hook, adicionar no início de cada mutation que faz INSERT:

```typescript
if (!user?.id) {
  throw new Error("Usuário não autenticado");
}
```

E alterar de `user?.id` para `user.id` após a verificação.

---

## Benefícios

1. **Erro claro**: Mensagem "Usuário não autenticado" em vez de erro genérico de RLS
2. **Prevenção**: Evita enviar dados inválidos ao banco
3. **Consistência**: Mesmo padrão em todos os hooks
4. **Debug facilitado**: Fácil identificar problemas de autenticação

---

## Hooks a Modificar (Resumo Técnico)

```text
src/hooks/useTransactions.ts    - linha 132
src/hooks/useCategories.ts      - linha 111
src/hooks/useAccounts.ts        - linha 41
src/hooks/useCreditCards.ts     - linhas 75, 130, 220, 252, 288, 322, 358
src/hooks/useBudgets.ts         - linha 46
src/hooks/useInvestments.ts     - linhas 111, 179, 218
src/hooks/useInstitutions.ts    - linha 39
src/hooks/useCategorizationRules.ts - linha 42
src/hooks/useInvitations.ts     - linhas 161, 173
```

Total: ~15 pontos de correção distribuídos em 9 arquivos.




# Correção: Edição de Parcelas Individuais

## Problema Identificado

Quando o usuário tenta editar uma parcela individual clicando em "Editar Parcela" no menu (três pontos) dentro do `InstallmentDetailsSheet`, **nada acontece** porque a prop `onEditTransaction` não está sendo passada.

### Fluxo Atual (Quebrado)

```text
1. Usuário clica na transação parcelada "MERCADOLIVRE*PROD 3/3"
2. InstallmentDetailsSheet abre mostrando todas as parcelas
3. Usuário clica no menu (⋮) da parcela 3/3
4. Usuário clica em "Editar Parcela"
5. handleEditSingle() é chamado
6. Verifica: if (onEditTransaction) → FALSE (prop não passada)
7. Nada acontece!
```

### Código Atual (Errado)

```typescript
// src/pages/Transactions.tsx - linhas 1224-1228
<InstallmentDetailsSheet
  open={!!selectedInstallmentGroupId}
  onOpenChange={(open) => !open && setSelectedInstallmentGroupId(null)}
  groupId={selectedInstallmentGroupId}
  // FALTANDO: onEditTransaction={handleEdit}
/>
```

---

## Solução

Adicionar a prop `onEditTransaction` ao `InstallmentDetailsSheet` e criar um handler que:
1. Fecha o sheet de parcelas
2. Abre o modal de transação com a parcela selecionada

### Arquivo: `src/pages/Transactions.tsx`

**Modificar linhas 1224-1228:**

```typescript
// Handler para editar parcela individual
const handleEditInstallment = (transaction: Transaction) => {
  setSelectedInstallmentGroupId(null); // Fecha o sheet de parcelas
  handleEdit(transaction); // Abre o modal de edição
};

// Na renderização:
<InstallmentDetailsSheet
  open={!!selectedInstallmentGroupId}
  onOpenChange={(open) => !open && setSelectedInstallmentGroupId(null)}
  groupId={selectedInstallmentGroupId}
  onEditTransaction={handleEditInstallment}
/>
```

---

## Resultado Esperado

### Fluxo Corrigido

```text
1. Usuário clica na transação parcelada "MERCADOLIVRE*PROD 3/3"
2. InstallmentDetailsSheet abre mostrando todas as parcelas
3. Usuário clica no menu (⋮) da parcela 3/3
4. Usuário clica em "Editar Parcela"
5. handleEditSingle() é chamado
6. Verifica: if (onEditTransaction) → TRUE
7. Sheet fecha e TransactionModal abre com os dados da parcela
8. Usuário edita valor/descrição/categoria
9. Salva e atualização reflete no sistema
```

---

## Detalhes Técnicos

### Localização da Alteração

| Arquivo | Linha | Modificação |
|---------|-------|-------------|
| `src/pages/Transactions.tsx` | ~475 | Adicionar função `handleEditInstallment` |
| `src/pages/Transactions.tsx` | ~1224-1228 | Passar prop `onEditTransaction` |

### Código Completo da Correção

```typescript
// Adicionar após handleTransactionClick (~linha 478)
const handleEditInstallment = (transaction: Transaction) => {
  setSelectedInstallmentGroupId(null);
  handleEdit(transaction);
};

// Modificar o InstallmentDetailsSheet (~linha 1224)
<InstallmentDetailsSheet
  open={!!selectedInstallmentGroupId}
  onOpenChange={(open) => !open && setSelectedInstallmentGroupId(null)}
  groupId={selectedInstallmentGroupId}
  onEditTransaction={handleEditInstallment}
/>
```

Esta é uma correção simples de uma linha que conecta a funcionalidade já existente.


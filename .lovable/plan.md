
# Melhorias no Lancamento Manual de Transacoes

## Problemas Identificados

### 1. Transacao com vencimento futuro conta como saida realizada
Ao criar "Seguro Apartamento" com vencimento em 02/03/2026 via debito em conta, a transacao entra no calculo de despesas reais mesmo estando com status "pendente". O sistema so exclui `is_provisional` dos totais, mas nao exclui transacoes com `status: "pending"`. Uma transacao pendente com vencimento futuro deveria ser tratada como projecao ate ser efetivada.

### 2. Sem opcao de parcelas para debito em conta
O toggle de parcelamento ("E compra parcelada?") so aparece quando o metodo de pagamento e "Cartao de Credito". Transacoes em conta (como seguro, financiamento, consorcio) nao permitem criar parcelas.

---

## Solucao

### Mudanca 1: Transacoes pendentes nao contam como saida realizada

**Arquivo: `src/hooks/useTransactions.ts`**

Adicionar filtro `status !== "pending"` nos calculos de `totalIncome`, `expenseTotal` e `expenseRefunds`. Transacoes pendentes serao tratadas como projecoes, assim como as provisorias.

```text
Antes:  !t.is_provisional
Depois: !t.is_provisional && t.status !== "pending"
```

Isso faz com que:
- Transacoes "completed" = saida realizada (entra nos totais)
- Transacoes "pending" = projecao (nao entra nos totais, como provisorias)

### Mudanca 2: Habilitar parcelamento para debito em conta

**Arquivo: `src/components/modals/TransactionModal.tsx`**

- Mover o bloco de parcelamento (linhas 593-653) para fora da condicao `paymentMethod === "credit_card"`
- Exibir para AMBOS os metodos de pagamento (conta e cartao), mantendo `!isEditing`
- Ajustar a logica de criacao de parcelas no `handleSubmit` (linhas 211-239) para funcionar sem credit_card_id:
  - Parcelas em conta usam `account_id` em vez de `credit_card_id`
  - O `due_date` das parcelas em conta sera a propria data da parcela (sem calculo de fechamento)
  - Status das parcelas futuras sera "pending" (projecao)

### Mudanca 3: Exibir campo de vencimento para debito em conta

**Arquivo: `src/components/modals/TransactionModal.tsx`**

- O campo "Data de Vencimento" (linhas 685-716) atualmente so aparece para cartao de credito
- Exibir tambem quando o metodo e "conta", permitindo ao usuario definir quando o debito sera efetivado
- Quando a data de vencimento for futura e metodo for conta, sugerir automaticamente status "pending"

---

## Secao Tecnica

### `src/hooks/useTransactions.ts` - Filtro de totais

Tres blocos a alterar (linhas 330, 336, 348):

```typescript
// totalIncome - adicionar && t.status !== "pending"
const totalIncome = transactions
  .filter((t) => t.type === "income" && !t.is_refund && !t.is_corporate_expense && !t.is_provisional && t.status !== "pending")
  .reduce((sum, t) => sum + Number(t.amount), 0);

// expenseTotal - adicionar && t.status !== "pending"  
const expenseTotal = transactions
  .filter((t) => 
    t.type === "expense" && 
    !t.is_corporate_expense && 
    !t.is_refund && 
    !t.is_reimbursable && 
    !t.is_card_payment &&
    !t.is_provisional &&
    t.status !== "pending"
  )
  .reduce((sum, t) => sum + Number(t.amount), 0);

// expenseRefunds - adicionar && t.status !== "pending"
const expenseRefunds = transactions
  .filter((t) => 
    t.type === "expense" && 
    t.is_refund && 
    !t.is_corporate_expense && 
    !t.is_reimbursable &&
    !t.is_provisional &&
    t.status !== "pending"
  )
  .reduce((sum, t) => sum + Number(t.amount), 0);
```

### `src/components/modals/TransactionModal.tsx` - Parcelamento universal

1. Mover bloco de parcelamento para fora do `if credit_card`:
```typescript
// De: {paymentMethod === "credit_card" && !isEditing && (
// Para: {!isEditing && (
```

2. Ajustar criacao de parcelas no handleSubmit para suportar conta:
```typescript
if (isInstallment && !isEditing) {
  const groupId = crypto.randomUUID();
  for (let i = installmentNumber; i <= totalInstallments; i++) {
    const installmentDate = addMonths(date, i - installmentNumber);
    await createTransaction.mutateAsync({
      description: `${description} ${i}/${totalInstallments}`,
      amount: parseFloat(amount),
      type,
      category_id: categoryId || null,
      account_id: paymentMethod === "account" ? (accountId || null) : null,
      credit_card_id: paymentMethod === "credit_card" ? (creditCardId || null) : null,
      date: format(installmentDate, "yyyy-MM-dd"),
      due_date: format(installmentDate, "yyyy-MM-dd"),
      status: i === installmentNumber ? status : "pending",
      // ... demais campos
      installment_group_id: groupId,
      installment_number: i,
      total_installments: totalInstallments,
    });
  }
}
```

3. Exibir campo de vencimento para todos os metodos:
```typescript
// De: {paymentMethod === "credit_card" && (
// Para: sempre exibir, com label contextualizado
```

4. Auto-sugerir status "pending" quando due_date for futura e metodo for conta:
```typescript
// Quando usuario seleciona dueDate futura em conta
useEffect(() => {
  if (paymentMethod === "account" && dueDate && dueDate > new Date()) {
    setStatus("pending");
  }
}, [dueDate, paymentMethod]);
```

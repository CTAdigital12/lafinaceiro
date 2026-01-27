

# Plano: Corrigir Busca de Transações para Vincular Pagamento de Fatura

## Contexto do Problema

O usuário está tentando vincular um pagamento de R$ 12.053,15 a uma transação existente, mas o sistema mostra "Nenhuma transação encontrada" por dois motivos:

1. **Filtro incorreto de `is_card_payment`**: A transação foi importada do extrato e identificada como pagamento de cartão (`is_card_payment: true`), mas o sistema filtra essas transações com `.eq("is_card_payment", false)`

2. **Cálculo de faixa de valor incorreto**: O hook usa o valor total da fatura (R$ 40.733,78) para calcular a faixa, mas deveria usar o valor que o usuário quer pagar ("Minha Parte")
   - Faixa atual: 30% a 150% de R$ 40.733 = R$ 12.220 a R$ 61.100
   - Valor da transação: R$ 12.053,15 (abaixo do mínimo!)

---

## Solução Proposta

### 1. Modificar hook `useBankPaymentCandidates.ts`

**Mudanças:**
- **Incluir** transações com `is_card_payment = true` (pagamentos de cartão já identificados pelo importador)
- Usar o valor que o usuário quer pagar (não o total da fatura) para calcular a faixa de busca
- Aumentar a tolerância da faixa para 20% a 200% do valor buscado

```text
Antes:
├── Busca transações onde is_card_payment = FALSE
├── Faixa: 30% a 150% do total da fatura
└── Parâmetro: invoiceAmount (total da fatura)

Depois:
├── Busca transações independente do is_card_payment
├── OU busca sem filtro de valor quando is_card_payment = true
├── Faixa: 20% a 200% do valor informado
└── Parâmetro: targetAmount (valor que o usuário quer pagar)
```

### 2. Modificar `PayInvoiceModal.tsx`

**Mudanças:**
- Passar o valor de `personalAmount` (Minha Parte) como parâmetro da busca, não o `totalInvoice`
- Adicionar opção para buscar especificamente transações marcadas como pagamento de cartão

---

## Detalhamento Técnico

### Arquivo: `src/hooks/useBankPaymentCandidates.ts`

```typescript
// Antes (linha 62)
.eq("is_card_payment", false)

// Depois: Remover este filtro para incluir todas as transações
// Ou criar dois grupos: transações normais + pagamentos de cartão
```

```typescript
// Antes (linhas 33-35)
const minAmount = invoiceAmount * 0.3;
const maxAmount = invoiceAmount * 1.5;

// Depois: Usar targetAmount e faixa mais ampla
const minAmount = targetAmount * 0.2;
const maxAmount = targetAmount * 2.0;
```

**Nova interface:**
```typescript
interface UseBankPaymentCandidatesOptions {
  targetAmount: number;      // Valor que o usuário quer pagar
  dueDate: Date;
  enabled?: boolean;
  includeCardPayments?: boolean;  // Nova opção para incluir is_card_payment=true
}
```

### Arquivo: `src/components/modals/PayInvoiceModal.tsx`

```typescript
// Antes (linhas 121-126)
const totalInvoice = Number(creditCard?.current_invoice || 0);
const { candidates } = useBankPaymentCandidates({
  invoiceAmount: totalInvoice,  // Usando total da fatura
  ...
});

// Depois: Usar o valor da minha parte
const myPaymentAmount = parseFloat(personalAmount) || myTotalToPay;
const { candidates } = useBankPaymentCandidates({
  targetAmount: myPaymentAmount,  // Usando o valor que vou pagar
  includeCardPayments: true,      // Incluir transações identificadas como pagamento
  ...
});
```

---

## Impacto da Mudança

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Transações com `is_card_payment=true` | Excluídas | Incluídas |
| Base para faixa de valor | Total fatura | Valor a pagar |
| Faixa de tolerância | 30%-150% | 20%-200% |
| Transação de R$ 12.053,15 | Não encontrada | Encontrada ✓ |

---

## Arquivos a Modificar

1. **`src/hooks/useBankPaymentCandidates.ts`**
   - Remover filtro `is_card_payment = false`
   - Alterar parâmetro de `invoiceAmount` para `targetAmount`
   - Expandir faixa de tolerância de valores

2. **`src/components/modals/PayInvoiceModal.tsx`**
   - Passar `personalAmount` como parâmetro da busca
   - Atualizar chamada do hook com novo nome de parâmetro


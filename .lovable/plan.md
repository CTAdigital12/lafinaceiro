
## Plano: Corrigir Recálculo Automático de due_date ao Editar Transações

### Problema Identificado

Ao editar qualquer campo de uma transação de cartão de crédito (descrição, categoria, notas), o sistema **recalcula o `due_date`** baseado na data de compra e dia de fechamento do cartão. Isso sobrescreve o `due_date` original que foi importado da fatura.

**Exemplo do erro encontrado nos seus dados:**
- Transação: `AMAZON BR 06/12 - TV`
- Importada em: 11/01/2026 com `due_date: 2026-01-15` (fatura janeiro)
- Editada em: 15/01/2026 às 01:36
- Resultado: `due_date` foi recalculado para `2025-08-15` (baseado na compra de 16/07)

Todas as 18 transações com `due_date` em meses anteriores foram **editadas manualmente** após a importação, e o sistema sobrescreveu o `due_date` incorretamente.

### Causa Raiz

No arquivo `TransactionModal.tsx`, a função `handleSubmit` sempre chama `calculateDueDate()` ao atualizar uma transação (linha 260):

```typescript
const transactionData = {
  // ...
  due_date: calculateDueDate(),  // SEMPRE recalcula
  // ...
};
```

### Solução Proposta

**Modificar a lógica para preservar o `due_date` original** quando:
1. O usuário NÃO alterou a data de compra
2. O usuário NÃO alterou o cartão de crédito
3. O `due_date` original já existe

**Apenas recalcular quando:**
1. O usuário alterou a data de compra (`date`)
2. O usuário trocou de cartão (`creditCardId`)
3. O `due_date` não existia antes

### Alterações Técnicas

**Arquivo:** `src/components/modals/TransactionModal.tsx`

1. Adicionar estado para rastrear se o usuário alterou campos críticos:
   ```typescript
   const [originalDate, setOriginalDate] = useState<Date | null>(null);
   const [originalCardId, setOriginalCardId] = useState<string | null>(null);
   const [originalDueDate, setOriginalDueDate] = useState<Date | null>(null);
   ```

2. No `useEffect` de inicialização, armazenar valores originais:
   ```typescript
   if (transaction) {
     setOriginalDate(parseISO(transaction.date));
     setOriginalCardId(transaction.credit_card_id);
     setOriginalDueDate(transaction.due_date ? parseISO(transaction.due_date) : null);
   }
   ```

3. Modificar `calculateDueDate` para verificar se deve recalcular:
   ```typescript
   const calculateDueDate = (): string | null => {
     // Se o usuário definiu uma data manual, usar ela
     if (dueDate) {
       return format(dueDate, "yyyy-MM-dd");
     }
     
     // Se editando e NÃO mudou data nem cartão, preservar original
     if (isEditing && originalDueDate) {
       const dateChanged = !originalDate || format(date, "yyyy-MM-dd") !== format(originalDate, "yyyy-MM-dd");
       const cardChanged = creditCardId !== originalCardId;
       
       if (!dateChanged && !cardChanged) {
         return format(originalDueDate, "yyyy-MM-dd"); // Preserva original
       }
     }
     
     // Recalcular normalmente se mudou ou é novo
     if (paymentMethod !== "credit_card" || !creditCardId) return null;
     // ... lógica existente de cálculo
   };
   ```

### Correção dos Dados Existentes

Como você só importou a fatura de janeiro, precisamos corrigir o `due_date` das transações que foram sobrescritas incorretamente.

**Transações a corrigir (18 ao total):**
- 12 transações com `due_date` em dezembro/2025 → devem ser `2026-01-15`
- 5 transações com `due_date` em novembro/2025 → devem ser `2026-01-15`
- 1 transação com `due_date` em agosto/2025 → deve ser `2026-01-15`

**Query de correção:**
```sql
UPDATE transactions
SET due_date = '2026-01-15'
WHERE credit_card_id IS NOT NULL
  AND imported_at >= '2026-01-01'
  AND imported_at < '2026-02-01'
  AND due_date < '2026-01-01';
```

### Resumo de Arquivos

| Arquivo | Ação |
|---------|------|
| `src/components/modals/TransactionModal.tsx` | Modificar - preservar due_date original ao editar |

### Considerações Adicionais

1. **UX**: Adicionar indicador visual quando o `due_date` vai ser recalculado (aviso: "A data de vencimento será atualizada")

2. **Override Manual**: O campo `dueDate` continua permitindo override manual, então se o usuário quiser mudar explicitamente, pode fazê-lo

3. **Logs**: Após a correção, testar editando uma transação para confirmar que o `due_date` original é preservado

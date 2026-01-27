
# Plano: Permitir Pagamento de Saldo Restante da Fatura

## Contexto do Problema

Após pagar a fatura parcialmente (baixa corporativa + vinculação de transação), o saldo restante do cartão é **R$ 93,90**. Porém, ao abrir o modal de pagamento:

1. O sistema calcula os totais com base nas transações ainda existentes
2. Como as transações já foram "contabilizadas" nos pagamentos anteriores, os valores aparecem zerados ou incorretos
3. O usuário não consegue pagar o saldo residual de R$ 93,90

## Solução Proposta

Adicionar uma seção "Saldo Restante" no modal que permite pagar qualquer diferença entre o `current_invoice` do cartão e o que já foi calculado/pago.

---

## Mudanças Detalhadas

### 1. Arquivo: `src/components/modals/PayInvoiceModal.tsx`

**Nova Seção - Saldo Residual:**
- Adicionar uma seção "Saldo Restante" quando `current_invoice > 0` e os totais calculados são menores que o saldo
- Permitir digitar manualmente o valor a pagar (pré-populado com `current_invoice`)
- Opções: débito em conta OU vincular a transação existente

**Mudanças na lógica:**
```text
Antes:
├── Modal calcula totais apenas das transações
├── Se totais = 0, não há o que pagar
└── Usuário fica travado

Depois:
├── Modal verifica: current_invoice > transactionsTotal calculado?
├── Se sim, mostra seção "Saldo Restante" com a diferença
├── Permite pagar o saldo residual via conta ou vincular transação
└── Campo de valor editável pré-populado com current_invoice atual
```

**Nova variável para detectar residual:**
```typescript
const residualBalance = Math.max(0, totalInvoice - transactionsTotal);
const hasResidualBalance = residualBalance > 0;
```

**Nova seção no UI (após seção pessoal):**
```typescript
{hasResidualBalance && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
    <h3 className="font-medium text-sm flex items-center gap-2">
      ⚠️ Saldo Residual
      <span className="text-muted-foreground font-normal">
        ({formatCurrency(residualBalance)})
      </span>
    </h3>
    <p className="text-xs text-muted-foreground">
      Este valor não está vinculado a transações específicas (pode ser juros, IOF, taxas ou diferenças de importação).
    </p>
    // Checkbox para incluir + campo de valor + opções de pagamento
  </div>
)}
```

### 2. Atualizar hook `useCreditCards.ts` - `paySplitInvoice`

**Adicionar suporte a pagamento de saldo residual:**
```typescript
interface SplitPaymentParams {
  // ... campos existentes ...
  
  // Nova seção para saldo residual
  residualAmount: number;
  includeResidual: boolean;
  residualPaymentType: "bank" | "external";
  residualAccountId: string | null;
  residualLinkedTransactionId: string | null;
}
```

### 3. Ajustar busca de candidatos para vincular

O hook `useBankPaymentCandidates` já foi atualizado para buscar transações pelo valor digitado. Para o saldo residual de R$ 93,90, a busca funcionará se:
- Faixa: 20% a 200% de R$ 93,90 = R$ 18,78 a R$ 187,80

---

## Fluxo do Usuário Após a Mudança

1. Usuário abre modal de pagamento do cartão
2. Vê que os totais calculados são R$ 0 (pois já foram pagos)
3. Porém, aparece seção "Saldo Residual: R$ 93,90"
4. Usuário marca "Incluir saldo residual" 
5. Escolhe: "Débito em conta" → seleciona conta OU "Vincular transação" → busca candidatos
6. Confirma pagamento
7. Fatura zerada

---

## Arquivos a Modificar

1. **`src/components/modals/PayInvoiceModal.tsx`**
   - Adicionar cálculo de `residualBalance`
   - Adicionar seção UI para saldo residual
   - Adicionar estados: `includeResidual`, `residualAmount`, `residualPaymentType`, `residualAccountId`, `residualLinkedTransactionId`
   - Passar novos parâmetros para `paySplitInvoice`

2. **`src/hooks/useCreditCards.ts`**
   - Atualizar interface `SplitPaymentParams`
   - Implementar lógica para processar pagamento de saldo residual (similar à seção pessoal)

---

## Impacto da Mudança

| Cenário | Antes | Depois |
|---------|-------|--------|
| Fatura com saldo residual | Não consegue pagar | Seção dedicada para pagar |
| Valores calculados = 0 | Modal "vazio" | Mostra saldo real do cartão |
| Juros/IOF/taxas não importados | Diferença fica pendente | Pode pagar como "saldo residual" |

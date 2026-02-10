

# Correção: Valores negativos e positivos não reconhecidos no CSV

## Problema

O parser de CSV de fatura tem dois pontos que eliminam o sinal dos valores:

1. **`parseAmount()` (linha 88)**: Usa `Math.abs(parsed)` que converte todos os valores para positivo -- estornos, créditos e devoluções perdem o sinal negativo
2. **`parseCSVInvoice()` (linha 233)**: Filtra com `amount <= 0`, descartando completamente qualquer linha com valor negativo

Resultado: estornos, créditos e devoluções presentes no CSV são ignorados silenciosamente.

## Solucao

### Arquivo: `src/lib/csvInvoiceParser.ts`

**1. `parseAmount()` -- remover `Math.abs()` (linha 88)**

Antes:
```typescript
return isNaN(parsed) ? 0 : Math.abs(parsed);
```

Depois:
```typescript
return isNaN(parsed) ? 0 : parsed;
```

**2. `parseCSVInvoice()` -- aceitar valores negativos (linha 233)**

Antes:
```typescript
if (!parsedDate || amount <= 0 || !descVal) continue;
```

Depois:
```typescript
if (!parsedDate || amount === 0 || !descVal) continue;
```

**3. `convertToImportedItems()` -- preservar o sinal no `transaction_value`**

Atualmente o `transaction_value` recebe `tx.amount` diretamente, o que agora incluira valores negativos. Isso esta correto pois o modal de revisao exibira o sinal e o usuario podera ver estornos/creditos claramente.

## Impacto

- Valores negativos no CSV (estornos, creditos, devolucoes) serao importados corretamente
- Valores positivos continuam funcionando normalmente
- O modal de revisao exibira o sinal para que o usuario identifique creditos vs debitos


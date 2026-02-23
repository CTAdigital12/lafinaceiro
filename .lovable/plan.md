
# Corrigir Deduplicacao de Transacoes Nao-Parceladas na Importacao de Faturas

## Problema

O sistema de deduplicacao so detecta duplicatas de **parcelas** (transacoes com installment_number). Transacoes avulsas (sem parcela) nunca sao verificadas, resultando em 18 transacoes duplicadas na fatura de marco.

Duas falhas no codigo atual:

1. **Query** (`useExistingInstallments.ts` linha 44): filtra `.not("installment_number", "is", null)` -- so busca parcelas
2. **Deteccao** (`detectDuplicates` linha 73): faz `if (!item.installment_current || !item.installment_total) return` -- pula itens sem parcela

## Solucao

Expandir a deduplicacao para cobrir TODAS as transacoes do periodo, nao apenas parcelas.

## Secao Tecnica

### Arquivo: `src/hooks/useExistingInstallments.ts`

**Mudanca 1 - Query mais abrangente:**
- Remover o filtro `.not("installment_number", "is", null)` para buscar TODAS as transacoes de despesa do cartao no periodo
- Renomear a interface/hook para refletir o escopo ampliado (ex: `ExistingTransaction` / `useExistingTransactions`) ou manter o nome atual por compatibilidade -- prefiro manter o nome para minimizar mudancas

**Mudanca 2 - Query adicionar campo `date`:**
- Incluir `date` no select para usar na comparacao de transacoes nao-parceladas

**Mudanca 3 - Deteccao de duplicatas ampliada:**
- Remover o `return` precoce para itens sem parcela
- Para itens COM parcela: manter logica atual (amount + installment_number + total_installments)
- Para itens SEM parcela: comparar por amount (com tolerancia) + date + descricao normalizada (uppercase, trim)
- Usar um Set para rastrear quais `existing` ja foram "consumidos" (evitar que duas transacoes importadas de mesmo valor casem com a mesma existente)

```typescript
export function detectDuplicates(
  importedItems: Array<{
    transaction_value: number;
    installment_current?: number | null;
    installment_total?: number | null;
    purchase_date?: string;
    description?: string;
  }>,
  existingTransactions: ExistingInstallment[]
): Map<number, ExistingInstallment> {
  const duplicateMap = new Map<number, ExistingInstallment>();
  const usedExistingIds = new Set<string>();
  const TOLERANCE = 0.05;

  importedItems.forEach((item, index) => {
    const isInstallment = !!(item.installment_current && item.installment_total);

    const match = existingTransactions.find((existing) => {
      if (usedExistingIds.has(existing.id)) return false;

      const amountMatch = Math.abs(Number(existing.amount) - item.transaction_value) <= TOLERANCE;
      if (!amountMatch) return false;

      if (isInstallment) {
        return (
          existing.installment_number === item.installment_current &&
          existing.total_installments === item.installment_total
        );
      } else {
        // Non-installment: match by amount + date + normalized description
        const dateMatch = existing.date === item.purchase_date;
        const descMatch = existing.description?.trim().toUpperCase() === 
                          item.description?.trim().toUpperCase();
        return dateMatch && descMatch;
      }
    });

    if (match) {
      duplicateMap.set(index, match);
      usedExistingIds.add(match.id);
    }
  });

  return duplicateMap;
}
```

### Interface ExistingInstallment - adicionar campos:
- `date: string` (para comparacao de transacoes avulsas)
- `description` ja existe

### Impacto
- Transacoes avulsas como "99Food", "CONTA VIVO", "LINKEDIN" serao detectadas como "Ja Lancado" e desmarcadas por padrao
- Parcelas continuam funcionando como antes
- Nenhuma migracao necessaria

### Limpeza dos dados atuais
- As 18 transacoes duplicadas ja inseridas precisarao ser removidas manualmente ou via a pagina de Atividades (desfazer a importacao de 2026-02-23 22:18:39)

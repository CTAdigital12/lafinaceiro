
# Deduplicação Inteligente e Rejeição de Itens na Importação de Faturas

## Visão Geral

Este plano implementa três melhorias críticas no `InvoiceReviewModal`:
1. **Deduplicação de Parcelas** - Detectar e marcar parcelas já existentes no banco
2. **Rejeição de Itens** - Permitir exclusão visual de itens indesejados
3. **Feedback Visual Aprimorado** - Coluna de status com indicadores visuais

---

## 1. Deduplicação Inteligente de Parcelas

### Lógica de Matching

```
Para cada item importado que é parcela:
  1. Buscar transações do banco no mesmo período (mês/ano da fatura)
  2. Comparar:
     - amount com tolerância de ±R$ 0,05
     - installment_number idêntico
     - total_installments idêntico
  3. Se match encontrado -> marcar como "duplicado"
```

### Novo Hook: `useExistingInstallments`

```typescript
// src/hooks/useExistingInstallments.ts

interface ExistingInstallment {
  id: string;
  description: string;
  amount: number;
  installment_number: number | null;
  total_installments: number | null;
}

export function useExistingInstallments({
  creditCardId,
  month,
  year,
  enabled = true,
}) {
  // Fetch transações do período que são parcelas
  // Retorna lista para comparação
}
```

### Função de Matching

```typescript
function findDuplicateMatch(
  importedItem: ImportedItem,
  existingInstallments: ExistingInstallment[]
): ExistingInstallment | null {
  const TOLERANCE = 0.05;
  
  return existingInstallments.find(existing => 
    Math.abs(existing.amount - importedItem.transaction_value) <= TOLERANCE &&
    existing.installment_number === importedItem.installment_current &&
    existing.total_installments === importedItem.installment_total
  ) || null;
}
```

---

## 2. Rejeição/Exclusão de Itens

### Comportamentos Implementados

| Ação | Resultado |
|------|-----------|
| Clique na Lixeira | Item marcado como "rejected" (riscado/desabilitado) |
| Toggle no Checkbox | Reativa/desativa item |
| Selecionar Tudo | Marca todos os itens "limpos" (não duplicados) |
| Desselecionar Tudo | Desmarca todos os itens |

### Novo Estado no ReviewItem

```typescript
interface ReviewItem extends ImportedItem {
  // ... campos existentes ...
  
  // NOVOS CAMPOS
  duplicate_status: 'new' | 'duplicate' | 'rejected';
  matched_transaction_id: string | null;  // ID da transação existente se duplicada
}
```

---

## 3. Feedback Visual - Coluna de Status

### Indicadores Visuais

| Status | Badge | Cor | Estilo do Card |
|--------|-------|-----|----------------|
| `new` | "Novo" | Verde | Normal |
| `duplicate` | "Já Lançado" | Amarelo/Âmbar | Fundo cinza, opacidade reduzida |
| `rejected` | "Ignorado" | Cinza | Riscado (line-through), desabilitado |

### Componente de Status Badge

```tsx
function StatusBadge({ status }: { status: 'new' | 'duplicate' | 'rejected' }) {
  const config = {
    new: { label: "Novo", className: "bg-income/10 text-income" },
    duplicate: { label: "Já Lançado", className: "bg-chart-4/10 text-chart-4" },
    rejected: { label: "Ignorado", className: "bg-muted text-muted-foreground" },
  };
  // ...
}
```

---

## 4. UI Atualizada do Modal

### Header com Seleção em Massa

```
┌─────────────────────────────────────────────────────────────┐
│ ☑ Selecionar Tudo │ Importando 15 de 18 itens │ [Novo: 12] │
│                   │                           │ [Dup: 3]   │
│                   │                           │ [Ign: 3]   │
└─────────────────────────────────────────────────────────────┘
```

### Linha de Item Atualizada

```
┌──────────────────────────────────────────────────────────────────────┐
│ ☑ │ [🟢 Novo] │ UBER EATS 3/10          │ R$ 45,00 │ [🗑️ Excluir] │
├──────────────────────────────────────────────────────────────────────┤
│ ☐ │ [🟡 Já Lançado] │ NETFLIX 2/12      │ R$ 55,90 │ [🔄 Forçar]  │
│   │ ⚠️ Encontrado match: "NETFLIX 2/12" de 15/12/2025               │
├──────────────────────────────────────────────────────────────────────┤
│   │ [⚫ Ignorado] │ PAGAMENTO EFETUADO   │ R$ 500,00│ [↩️ Restaurar]│
│   │ ~~~~~~~~~~~~   (linha riscada)                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Arquivos a Modificar/Criar

### Criar Novo Hook

| Arquivo | Ação |
|---------|------|
| `src/hooks/useExistingInstallments.ts` | **CRIAR** - Busca parcelas existentes |

### Modificar Modal

| Arquivo | Modificações |
|---------|--------------|
| `src/components/modals/InvoiceReviewModal.tsx` | Interface `ReviewItem`, lógica de matching, UI de status |

---

## 6. Detalhes Técnicos de Implementação

### 6.1 Hook `useExistingInstallments`

```typescript
export function useExistingInstallments({
  creditCardId,
  month,
  year,
  enabled = true,
}: {
  creditCardId: string;
  month: number;
  year: number;
  enabled?: boolean;
}) {
  const { user } = useAuth();
  
  const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
  const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["existing-installments", creditCardId, month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, installment_number, total_installments")
        .eq("credit_card_id", creditCardId)
        .eq("type", "expense")
        .not("installment_number", "is", null)
        .or(`and(due_date.gte.${periodStart},due_date.lte.${periodEnd}),and(due_date.is.null,date.gte.${periodStart},date.lte.${periodEnd})`);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!creditCardId && enabled,
  });
}
```

### 6.2 Função de Detecção de Duplicatas

```typescript
function detectDuplicates(
  importedItems: ImportedItem[],
  existingInstallments: ExistingInstallment[]
): Map<number, ExistingInstallment> {
  const duplicateMap = new Map<number, ExistingInstallment>();
  const TOLERANCE = 0.05;
  
  importedItems.forEach((item, index) => {
    // Só checar itens que são parcelas
    if (!item.installment_current || !item.installment_total) return;
    
    const match = existingInstallments.find(existing =>
      Math.abs(Number(existing.amount) - item.transaction_value) <= TOLERANCE &&
      existing.installment_number === item.installment_current &&
      existing.total_installments === item.installment_total
    );
    
    if (match) {
      duplicateMap.set(index, match);
    }
  });
  
  return duplicateMap;
}
```

### 6.3 Inicialização com Status

```typescript
// No useEffect de inicialização
const duplicateMap = detectDuplicates(items, existingInstallments);

const itemsWithStatus = items.map((item, index) => {
  const matchedTransaction = duplicateMap.get(index);
  const isDuplicate = !!matchedTransaction;
  
  return {
    ...item,
    // ... outros campos ...
    duplicate_status: isDuplicate ? 'duplicate' : 'new',
    matched_transaction_id: matchedTransaction?.id || null,
    include_in_import: isDuplicate ? false : !item.is_post_closing, // Desmarcado se duplicado
  };
});
```

### 6.4 Handlers de Ação

```typescript
// Rejeitar item (marcar como ignorado)
const handleRejectItem = (index: number) => {
  setReviewItems(prev => prev.map((item, i) => 
    i === index 
      ? { ...item, duplicate_status: 'rejected', include_in_import: false }
      : item
  ));
};

// Restaurar item rejeitado
const handleRestoreItem = (index: number) => {
  setReviewItems(prev => prev.map((item, i) => {
    if (i !== index) return item;
    // Retorna ao status original (new ou duplicate)
    const wasOriginallyDuplicate = !!item.matched_transaction_id;
    return {
      ...item,
      duplicate_status: wasOriginallyDuplicate ? 'duplicate' : 'new',
      include_in_import: !wasOriginallyDuplicate,
    };
  }));
};

// Forçar importação de duplicado (usuário tem certeza)
const handleForceInclude = (index: number) => {
  setReviewItems(prev => prev.map((item, i) =>
    i === index ? { ...item, include_in_import: true } : item
  ));
};

// Selecionar/Desselecionar todos
const handleSelectAll = (selected: boolean) => {
  setReviewItems(prev => prev.map(item => ({
    ...item,
    include_in_import: selected && item.duplicate_status !== 'rejected'
      ? (item.duplicate_status === 'duplicate' ? item.include_in_import : true)
      : false,
  })));
};
```

### 6.5 Contadores para UI

```typescript
const statusCounts = {
  new: reviewItems.filter(i => i.duplicate_status === 'new').length,
  duplicate: reviewItems.filter(i => i.duplicate_status === 'duplicate').length,
  rejected: reviewItems.filter(i => i.duplicate_status === 'rejected').length,
};

const includedCount = reviewItems.filter(i => i.include_in_import).length;
const totalCount = reviewItems.length;
```

---

## 7. Fluxo de Usuário Final

```
1. Usuário importa fatura (PDF/CSV)
2. Modal de Revisão abre
3. Sistema busca transações existentes do período
4. Sistema compara e marca duplicatas automaticamente
   - Duplicadas: checkbox desmarcado, badge amarelo
   - Novas: checkbox marcado, badge verde
5. Usuário pode:
   - Clicar 🗑️ para ignorar itens indesejados
   - Clicar ↩️ para restaurar itens ignorados  
   - Clicar [Forçar] em duplicados se tiver certeza
   - Usar "Selecionar Tudo" no header
6. Footer mostra: "Importando 15 de 18 itens"
7. Usuário confirma importação
```

---

## 8. Resumo das Mudanças

| Componente | Mudança |
|------------|---------|
| `useExistingInstallments.ts` | **CRIAR** - Hook para buscar parcelas existentes |
| `InvoiceReviewModal.tsx` | Adicionar lógica de matching, novo campo `duplicate_status`, UI de status badges, botões de rejeitar/restaurar, seleção em massa |

### Imports Adicionais no Modal

```typescript
import { Trash2, RotateCcw } from "lucide-react";
import { useExistingInstallments } from "@/hooks/useExistingInstallments";
```

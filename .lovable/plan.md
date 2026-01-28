

# Correção: Memoizar Funções do Hook useCategorizationRules

## Diagnóstico Final

O problema é causado por um **bug clássico de dependência do useEffect**:

1. As funções `findCategoryForDescription` e `findCorporateForDescription` são recriadas a cada render
2. Elas estão no array de dependências do useEffect que inicializa `reviewItems`
3. Quando o usuário digita, o componente re-renderiza
4. O useEffect detecta "novas" funções e reseta todo o estado com os dados originais

## Solução

Memoizar as funções no hook `useCategorizationRules` usando `useCallback`:

```tsx
const findCategoryForDescription = useCallback((description: string): string | null => {
  const upperDesc = description.toUpperCase();
  
  for (const rule of rules) {
    if (upperDesc.includes(rule.keyword.toUpperCase())) {
      return rule.category_id;
    }
  }
  
  return null;
}, [rules]);

const findCorporateForDescription = useCallback((description: string): boolean => {
  const upperDesc = description.toUpperCase();
  
  for (const rule of rules) {
    if (upperDesc.includes(rule.keyword.toUpperCase())) {
      return rule.is_corporate || false;
    }
  }
  
  return false;
}, [rules]);
```

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/useCategorizationRules.ts` | Importar `useCallback` e envolver as funções `findCategoryForDescription` e `findCorporateForDescription` |

## Mudanças Específicas

**Linha 1** - Adicionar `useCallback` ao import:
```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback } from "react";
```

**Linhas 112-122** - Memoizar `findCategoryForDescription`:
```tsx
const findCategoryForDescription = useCallback((description: string): string | null => {
  const upperDesc = description.toUpperCase();
  
  for (const rule of rules) {
    if (upperDesc.includes(rule.keyword.toUpperCase())) {
      return rule.category_id;
    }
  }
  
  return null;
}, [rules]);
```

**Linhas 125-135** - Memoizar `findCorporateForDescription`:
```tsx
const findCorporateForDescription = useCallback((description: string): boolean => {
  const upperDesc = description.toUpperCase();
  
  for (const rule of rules) {
    if (upperDesc.includes(rule.keyword.toUpperCase())) {
      return rule.is_corporate || false;
    }
  }
  
  return false;
}, [rules]);
```

## Por que isso funciona?

`useCallback` garante que a função só seja recriada quando `rules` mudar. Isso significa que:
- Quando o usuário digita, as funções mantêm a mesma referência
- O useEffect não detecta mudança nas dependências
- O estado `reviewItems` não é sobrescrito

## Teste Esperado

1. Abrir modal de revisão de fatura
2. Clicar no campo de descrição
3. Digitar/apagar texto
4. O texto deve ser atualizado em tempo real sem reverter

---

### Seção Técnica

**Causa raiz**: Funções não-memoizadas em hooks customizados causam re-execução de useEffect em componentes consumidores quando usadas como dependências.

**Padrão recomendado**: Sempre usar `useCallback` para funções retornadas por hooks customizados que possam ser usadas em arrays de dependências.


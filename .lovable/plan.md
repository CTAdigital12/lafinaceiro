

# Correção: Seletor Global de Mês na Página de Cartões

## Problema

A página de Cartões de Crédito (`CreditCards.tsx`) usa estado local próprio para o mês/ano:

```typescript
const now = new Date();
const [reconciliationMonth, setReconciliationMonth] = useState(now.getMonth() + 1);
const [reconciliationYear, setReconciliationYear] = useState(now.getFullYear());
```

Enquanto o seletor do cabeçalho atualiza o contexto global `DateContext` via `useDate()`. Os dois não estão conectados.

## Solução

Substituir o estado local pelo contexto global `useDate()`. O seletor de mês **dentro** do `ReconciliationCard` continuará funcionando como override local (para navegação rápida dentro da conciliação), mas o estado inicial virá do cabeçalho.

## Mudanças

### `src/pages/CreditCards.tsx`

1. Importar `useDate` do contexto global
2. Remover as variáveis locais `reconciliationMonth`, `reconciliationYear` e `handlePeriodChange`
3. Usar `month` e `year` do `useDate()` diretamente
4. Passar para o `ReconciliationCard` e para o hook `useCreditCardReconciliation`

```typescript
// ANTES
const now = new Date();
const [reconciliationMonth, setReconciliationMonth] = useState(now.getMonth() + 1);
const [reconciliationYear, setReconciliationYear] = useState(now.getFullYear());

// DEPOIS
import { useDate } from "@/contexts/DateContext";
const { month, year } = useDate();
```

O `ReconciliationCard` já possui seu próprio seletor de mês interno que permite navegar entre períodos independentemente. A mudança é apenas que o **valor inicial** e o **seletor do cabeçalho** agora estarão sincronizados.

Para manter a funcionalidade do seletor interno do ReconciliationCard (que permite o usuário mudar o mês só dentro da conciliação), vamos manter o estado local mas inicializá-lo a partir do contexto global e sincronizá-lo quando o cabeçalho mudar:

```typescript
const { month: globalMonth, year: globalYear } = useDate();
const [reconciliationMonth, setReconciliationMonth] = useState(globalMonth);
const [reconciliationYear, setReconciliationYear] = useState(globalYear);

// Sincronizar quando o cabeçalho mudar
useEffect(() => {
  setReconciliationMonth(globalMonth);
  setReconciliationYear(globalYear);
}, [globalMonth, globalYear]);
```

### Arquivo a modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/CreditCards.tsx` | Importar `useDate`, sincronizar estado local com contexto global via `useEffect` |



# Melhorias no Planejamento Mensal

## 1. Categorias comecam fechadas

Atualmente o estado `collapsedCategories` inicia como um `Set` vazio (tudo aberto). A mudanca e inicializar com todas as categorias pai que possuem filhos ja colapsadas.

Como `parentCategoriesWithChildren` depende de `hierarchicalBudgets` (que depende de dados async), a inicializacao sera feita via `useEffect` que popula o Set na primeira vez que os dados carregam.

## 2. Ver lancamentos por categoria

Ao clicar numa categoria (pai ou filho), abrir uma lista colapsavel mostrando as transacoes daquela categoria no mes. Sera adicionado um estado `expandedTransactions` que controla qual categoria esta com lancamentos visiveis. As transacoes ja estao carregadas no hook `useTransactions` - basta filtrar por `category_id`.

A lista mostrara: data, descricao e valor de cada transacao, dentro de uma area colapsavel abaixo da linha da categoria.

---

## Secao Tecnica

### Arquivo: `src/pages/Planning.tsx`

**Mudanca 1 - Categorias fechadas por padrao:**
- Adicionar `useEffect` que, ao carregar `parentCategoriesWithChildren` pela primeira vez, seta `collapsedCategories` com todos os IDs
- Usar um `ref` (`hasInitialized`) para executar apenas uma vez por montagem

```typescript
const hasInitializedCollapse = useRef(false);

useEffect(() => {
  if (!hasInitializedCollapse.current && parentCategoriesWithChildren.length > 0) {
    setCollapsedCategories(new Set(parentCategoriesWithChildren));
    hasInitializedCollapse.current = true;
  }
}, [parentCategoriesWithChildren]);
```

**Mudanca 2 - Expandir lancamentos por categoria:**
- Novo estado: `expandedTransactions: Set<string>` (IDs de categorias com lancamentos visiveis)
- Funcao `toggleTransactions(categoryId)` para abrir/fechar
- Filtrar `transactions` por `category_id` da categoria clicada (para pai, incluir subcategorias)
- No desktop (Table): adicionar uma `TableRow` colapsavel abaixo da linha do budget mostrando as transacoes
- No mobile (Cards): adicionar secao colapsavel dentro do card mostrando as transacoes
- Botao de "ver lancamentos" sera um icone de lista na coluna de acoes (ou o proprio nome da categoria sera clicavel)

**Layout dos lancamentos expandidos (desktop):**
```text
| Data       | Descricao              | Valor       |
|------------|------------------------|-------------|
| 01/02/2026 | Supermercado XYZ       | R$ 450,00   |
| 05/02/2026 | Feira da semana        | R$ 120,50   |
```

**Layout dos lancamentos expandidos (mobile):**
Lista simples com data, descricao e valor em cada linha.

Clicar numa transacao abrira o `TransactionModal` para edicao (reutilizando o modal ja existente).

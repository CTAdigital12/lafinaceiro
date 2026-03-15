

## Reformulação da aba Projetos — Orçamento vs Realizado

### O que muda

**1. Orçamento vs Realizado — Apenas categorias pai (com expansão)**
- Agrupar os budgets por categoria pai: somar planejado e realizado das subcategorias sob cada pai
- Mostrar apenas as categorias pai como linhas colapsáveis (usando Collapsible)
- Ao clicar, expande para mostrar as subcategorias com seus valores individuais
- Categorias sem pai (leaf) continuam aparecendo normalmente

**2. Novo gráfico: Orçado vs Realizado mensal com variação %**
- Gráfico de barras agrupadas (Orçado vs Realizado) dos últimos 6 meses usando ComposedChart do Recharts
- Linha sobreposta mostrando a variação % mensal do custo (crescimento ou diminuição vs mês anterior)
- Cores: verde quando despesa diminuiu, vermelho quando aumentou
- Tooltip mostrando os 3 valores (orçado, realizado, variação %)

**3. Novo card: Acumulado do período**
- Card no topo mostrando o total orçado vs total realizado acumulado dos 6 meses
- Barra de progresso geral + diferença em R$ e %

### Arquivos alterados

**`src/components/reports/ProjectsPlanningTab.tsx`** — reescrita completa:
- Buscar budgets dos últimos 6 meses (não só o mês atual) usando queries diretas ao Supabase
- Agrupar categorias pai/filho com estado de expansão via `useState`
- Adicionar ComposedChart com barras (orçado/realizado) + linha de variação %
- Cards de resumo acumulado no topo
- Manter a seção de Projetos Ativos como está (já funciona bem)

### Dados necessários
- Budgets de 6 meses: query direta ao Supabase filtrando pelo range de meses (não depende do hook `useBudgets` que só busca 1 mês)
- Transações já carregadas com `showAll: true`
- Categorias para mapear parent_id




# Corrigir cálculo do total planejado de categorias pai

## Problema
Quando uma categoria pai (ex: Lazer) tem subcategorias no planejamento e todas estão zeradas, o sistema ignora a soma dos filhos (0) e exibe o valor do próprio pai (R$ 120). Isso acontece porque o codigo verifica `childrenPlanned > 0` antes de decidir qual valor usar.

## Solucao
Alterar a logica na linha 157 de `src/pages/Planning.tsx`: se a categoria pai tem filhos no planejamento, sempre usar a soma dos filhos, independente de ser zero ou nao.

## Secao tecnica

Arquivo: `src/pages/Planning.tsx`, linha 157

De:
```text
parent.totalPlanned = childrenPlanned > 0 ? childrenPlanned : Number(parent.planned_amount);
```

Para:
```text
parent.totalPlanned = parent.children && parent.children.length > 0 ? childrenPlanned : Number(parent.planned_amount);
```

Isso garante que se existem subcategorias no planejamento, o total do pai sera a soma delas (mesmo que zero). O valor proprio do pai so sera usado quando nao houver nenhuma subcategoria cadastrada no planejamento.

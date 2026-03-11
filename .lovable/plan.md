

## Adicionar "Resultado" no tooltip do Balanço Mensal

Alterar o `CustomTooltip` em `src/components/dashboard/BalanceChart.tsx` para exibir uma terceira linha com o resultado (receitas - despesas), formatado em R$ e com cor condicional (verde se positivo, vermelho se negativo).

### Alteração

**Arquivo**: `src/components/dashboard/BalanceChart.tsx`

No `CustomTooltip`, após exibir receitas e despesas, calcular `resultado = receitas - despesas` e renderizar uma linha adicional com estilo condicional baseado no sinal do valor.


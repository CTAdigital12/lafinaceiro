

## Correções nos Relatórios: Fluxo de Caixa + Projetos

### Problema 1: Fluxo de Caixa
- Gráfico com 12 meses fica apertado — reduzir para **6 meses**
- Bug de sinal: despesas aparecem como valor positivo no gráfico de barras, mas o `saldo acumulado` calcula `income - expense` corretamente. O problema é que as barras de despesa mostram o valor absoluto (positivo) — isso é correto visualmente. O **bug real** está no saldo acumulado: em fevereiro as despesas foram menores que receitas, mas o saldo está mostrando positivo quando deveria refletir a diferença. Revisando o código: `Math.max(0, expenseByMonth[m] || 0)` na linha 71 força despesas negativas (quando refunds superam) a zero — isso está ok. O saldo acumulado é `income - expense`, que deveria dar positivo quando receita > despesa. O usuário diz que em fev despesas < receitas mas o valor está positivo — isso é o comportamento correto (receita > despesa = saldo positivo). Possivelmente o usuário está confundindo a leitura, mas vou **colorir o saldo acumulado em vermelho quando negativo** para clareza
- Adicionar cor condicional no saldo acumulado (vermelho quando negativo, verde quando positivo)

### Problema 2: Aba Projetos
- Radar chart muito pequeno e pouco informativo
- Seção "Impacto dos Projetos" vazia e sem contexto
- Reformular para ser mais útil: substituir por **cards de resumo dos projetos ativos** com barra de progresso + lista de orçamentos com comparativo visual

### Alterações

**`src/components/reports/CashFlowTab.tsx`**:
1. Reduzir de 12 para **6 meses**
2. Aumentar altura do gráfico de `h-[300px]` para `h-[350px]`
3. Aumentar `barSize` de 16 para 24 (barras mais largas com menos meses)
4. Colorir a linha de saldo acumulado condicionalmente — usar Cell/segments ou renderizar como barras coloridas. Na prática, usar um custom dot + colorir o texto do tooltip. A forma mais eficaz: adicionar um card de "Saldo do Período" com cor condicional (verde/vermelho)
5. Adicionar card de "Saldo do Período" mostrando o acumulado final com cor verde/vermelha

**`src/components/reports/ProjectsPlanningTab.tsx`**:
1. Substituir o RadarChart por uma **lista de cards** de orçamento (categoria, planejado vs realizado, barra de progresso com cor dinâmica)
2. Substituir o gráfico de barras dos projetos por **cards dos projetos ativos** com ícone, nome, gasto/orçado, barra de progresso (mesmo estilo da página de Projetos)
3. Se não houver projetos ou orçamentos, mostrar empty states mais informativos com sugestão de ação


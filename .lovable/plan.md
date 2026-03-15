

## Reformulação Completa: Relatórios → Financial Intelligence Hub

### Estrutura Geral

Substituir o conteúdo atual de `Reports.tsx` por 4 abas com `ScrollArea` horizontal no `TabsList` para mobile. Cada aba será um componente separado em `src/components/reports/`.

### Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `src/components/reports/CashFlowTab.tsx` | Aba 1: Fluxo de Caixa |
| `src/components/reports/ExpenseXRayTab.tsx` | Aba 2: Raio-X de Despesas |
| `src/components/reports/NetWorthTab.tsx` | Aba 3: Patrimônio |
| `src/components/reports/ProjectsPlanningTab.tsx` | Aba 4: Projetos e Planejamento |

### Arquivo a Editar

- `src/pages/Reports.tsx` — Reescrever com 4 tabs + ScrollArea horizontal

### Aba 1: Fluxo de Caixa (`CashFlowTab`)

- **Dados**: Últimos 12 meses de transações (usa `useTransactions` com `showAll: true`)
- **Cards de Insight**: "Meses Positivos" (contagem de meses onde receita > despesa) e "Taxa de Poupança Média" (% da renda que sobra)
- **Gráfico**: `ComposedChart` do Recharts — barras verdes (receitas), barras vermelhas (despesas), linha azul (saldo acumulado)
- **Filtro de dados**: Exclui `is_card_payment`, `is_provisional`, `status: 'pending'`, deduz `is_refund`
- **Agrupamento temporal**: `due_date` para transações de cartão, `date` para as demais

### Aba 2: Raio-X de Despesas (`ExpenseXRayTab`)

- **Comparativo MoM**: Top 5 categorias do mês atual com badge de variação vs mês anterior (+15% vermelho, -5% verde)
- **Composição de Gastos**: Gráfico `Treemap` do Recharts com categorias pai, proporcional ao valor
- **Fuga de Capital**: Card com as 5 maiores despesas individuais do mês (transações avulsas, não categorias)
- **Reutiliza** a lógica de filtragem existente já presente no Reports atual (linhas 41-52)

### Aba 3: Patrimônio (`NetWorthTab`)

- **Ativos**: `useAccounts` (soma `computed_balance`) + `useInvestments` (soma via `getAssetPatrimony`)
- **Passivos**: Faturas abertas de cartão (`useCreditCards` → `current_invoice`) + parcelas pendentes (`usePendingInstallments` → `summary.totalAmount`)
- **Patrimônio Líquido**: Ativos - Passivos em destaque grande
- **Gráfico**: `AreaChart` — evolução patrimonial simplificada (baseada nos saldos atuais, sem histórico armazenado; nota: mostrará snapshot atual com projeção baseada nas transações dos últimos meses)

### Aba 4: Projetos e Planejamento (`ProjectsPlanningTab`)

- **Radar Chart**: Usa `useBudgets` (mês/ano atual) para pegar categorias com orçamento. Compara `planned_amount` vs gasto real calculado das transações do mês
- **Análise de Caixinhas**: `useProjects` → gráfico de barras empilhadas mostrando quanto cada projeto consumiu do gasto mensal total (% do gasto atribuído a projetos)

### Regras de Cálculo (aplicadas em TODAS as abas)

Função utilitária compartilhada `filterPureExpenses(transactions)`:
```ts
// Retorna apenas despesas "puras" para cálculos
t.type === 'expense' && !t.is_card_payment && !t.is_provisional && t.status !== 'pending' && !t.is_refund
```

Função `getTransactionCompetenceDate(t)`:
```ts
// Retorna due_date para cartão, date para o resto
t.credit_card_id && t.due_date ? t.due_date : t.date
```

### Responsividade Mobile-First

- `TabsList` dentro de `ScrollArea` horizontal com `w-max` para scroll por deslize
- Gráficos com `h-[300px]` fixo
- Legendas posicionadas com `verticalAlign="bottom"`
- Cards de insight em `grid-cols-2` no mobile

### Reports.tsx (estrutura final)

```tsx
<Tabs defaultValue="fluxo">
  <ScrollArea orientation="horizontal">
    <TabsList className="w-max">
      <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
      <TabsTrigger value="raio-x">Raio-X</TabsTrigger>
      <TabsTrigger value="patrimonio">Patrimônio</TabsTrigger>
      <TabsTrigger value="projetos">Projetos</TabsTrigger>
    </TabsList>
  </ScrollArea>
  <TabsContent value="fluxo"><CashFlowTab /></TabsContent>
  <TabsContent value="raio-x"><ExpenseXRayTab /></TabsContent>
  <TabsContent value="patrimonio"><NetWorthTab /></TabsContent>
  <TabsContent value="projetos"><ProjectsPlanningTab /></TabsContent>
</Tabs>
```

A aba de Reembolsos existente (`RefundReport`) será mantida como sub-aba dentro do Raio-X de Despesas.


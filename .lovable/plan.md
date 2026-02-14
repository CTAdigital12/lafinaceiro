

# Corrigir agrupamento de parcelas por mês

## Problema
A "Previsao por Mes" mostra "Nenhuma parcela futura" porque o agrupamento usa o campo `date` da transacao (data da compra, ex: 2025-07-16) em vez do `due_date` (data de vencimento, ex: 2026-03-15). Como todas as datas de compra sao de 2025, o filtro de meses futuros (>= 2026-02) exclui tudo.

## Causa raiz
No hook `usePendingInstallments.ts`, o calculo de `byMonth` (linha ~103-110) agrupa por `installment.date`:

```text
const date = parse(installment.date, "yyyy-MM-dd", new Date());
const monthKey = format(date, "yyyy-MM");
```

Deveria agrupar por `installment.due_date` quando disponivel, pois esse campo indica em qual mes a parcela sera cobrada.

## Solucao
Alterar o agrupamento em `usePendingInstallments.ts` para usar `due_date` em vez de `date`.

### Alteracao em `src/hooks/usePendingInstallments.ts`

Na secao "Group by month" (linhas ~103-114), trocar o campo usado para agrupar:

```text
Antes:
  const date = parse(installment.date, "yyyy-MM-dd", new Date());

Depois:
  const dateStr = installment.due_date || installment.date;
  const date = parse(dateStr, "yyyy-MM-dd", new Date());
```

O campo `due_date` e preenchido para parcelas (ex: "2026-03-15", "2026-04-15") e indica quando cada parcela vence. Se por algum motivo nao existir, usa o `date` como fallback.

Nenhuma outra alteracao necessaria -- o campo `due_date` ja existe na interface `PendingInstallment` (vem da query do Supabase) e o componente `MonthlyBreakdown` ja filtra corretamente por meses futuros.

## Resultado esperado
- Marco/2026: parcelas com vencimento em marco
- Abril/2026: parcelas com vencimento em abril
- E assim por diante ate julho/2026

## Secao tecnica
- Arquivo: `src/hooks/usePendingInstallments.ts`
- A interface `PendingInstallment` nao expoe `due_date` atualmente -- sera necessario adicionar o campo `due_date` a interface e ao mapeamento no `queryFn`
- Na query, o campo `due_date` ja e retornado pelo `select("*")` da tabela `transactions`

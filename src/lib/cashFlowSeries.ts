import type { Transaction } from "@/hooks/useTransactions";
import {
  filterPureExpenses,
  filterPureIncome,
  getCompetenceDate,
} from "@/lib/reportUtils";

/**
 * Série mensal de receitas, despesas e saldo do Fluxo de Caixa.
 *
 * Estava embutida num `useMemo` dentro de `CashFlowTab`, onde nenhum teste
 * alcançava. Saiu para cá pela convenção do repositório: regra pura vive em
 * `src/lib/`, nunca junto do componente ou do hook.
 *
 * O ACHADO M2 era esta linha, que existia no lugar do `netExpense` de hoje:
 *
 *     const expense = Math.max(0, expenseByMonth[m] || 0);
 *
 * `expenseByMonth` já nasce LÍQUIDO — estorno entra subtraindo (`is_refund`),
 * porque `filterPureExpenses` não remove estorno e deixa a decisão para quem
 * chama. Então o mês em que os estornos superam as despesas tem despesa
 * NEGATIVA, e isso é informação verdadeira: no líquido, entrou dinheiro.
 *
 * O piso em zero apagava justamente esse mês. Com ele, `despesas` virava 0 e
 * o saldo do mês virava `receitas - 0`, ou seja, **menor do que o real** — a
 * devolução sumia do saldo mensal, do acumulado e da taxa de poupança. O piso
 * não protegia nada: subtrair um número negativo é operação normal.
 *
 * Note que este piso NÃO é o mesmo do `sumInvoice`/`recompute_card_invoice`.
 * Lá o `GREATEST(0, …)` é deliberado e replicado em SQL e TypeScript para
 * manter a paridade do A10; mexer numa cópia só reabre aquele defeito. Aqui é
 * relatório, não tem par em lugar nenhum, e sai sozinho.
 */
export interface CashFlowMonth {
  /** Competência no formato `yyyy-MM`. */
  month: string;
  income: number;
  /** Despesa LÍQUIDA do mês. Negativa quando os estornos superam as despesas. */
  netExpense: number;
  /** `income - netExpense`. */
  balance: number;
  /** Soma dos `balance` até este mês, inclusive. */
  cumulativeBalance: number;
}

export interface CashFlowSummary {
  months: CashFlowMonth[];
  /** Quantos meses fecharam com saldo positivo. */
  positiveMonths: number;
  totalMonths: number;
  /** Média de `(receita - despesa) / receita`, só sobre meses COM receita. */
  avgSavingRate: number;
  periodBalance: number;
  lastMonthBalance: number;
}

/**
 * @param transactions lançamentos já carregados (a filtragem acontece aqui).
 * @param months competências `yyyy-MM`, em ordem cronológica.
 */
export function buildCashFlowSeries(
  transactions: Transaction[],
  months: string[],
): CashFlowSummary {
  const incomeByMonth: Record<string, number> = {};
  const expenseByMonth: Record<string, number> = {};

  for (const t of filterPureIncome(transactions)) {
    const m = getCompetenceDate(t).substring(0, 7);
    incomeByMonth[m] = (incomeByMonth[m] || 0) + Number(t.amount);
  }

  for (const t of filterPureExpenses(transactions)) {
    const m = getCompetenceDate(t).substring(0, 7);
    const delta = t.is_refund ? -Number(t.amount) : Number(t.amount);
    expenseByMonth[m] = (expenseByMonth[m] || 0) + delta;
  }

  let cumulativeBalance = 0;
  let positiveMonths = 0;
  let savingRateSum = 0;
  let monthsWithIncome = 0;

  const rows = months.map((month) => {
    const income = incomeByMonth[month] || 0;
    const netExpense = expenseByMonth[month] || 0;
    const balance = income - netExpense;
    cumulativeBalance += balance;

    if (balance > 0) positiveMonths++;
    if (income > 0) {
      savingRateSum += (balance / income) * 100;
      monthsWithIncome++;
    }

    return { month, income, netExpense, balance, cumulativeBalance };
  });

  return {
    months: rows,
    positiveMonths,
    totalMonths: months.length,
    avgSavingRate:
      monthsWithIncome > 0 ? Math.round(savingRateSum / monthsWithIncome) : 0,
    periodBalance: cumulativeBalance,
    lastMonthBalance: rows[rows.length - 1]?.balance ?? 0,
  };
}

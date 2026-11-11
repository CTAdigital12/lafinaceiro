import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { isMonthlyIncome, isMonthlyExpense, isMonthlyExpenseRefund } from "@/lib/transactionFilters";
import { competenceRangeFilter, getCompetenceDate } from "@/lib/reportUtils";
import { endOfMonthYmd, startOfMonthYmd } from "@/lib/dateUtils";
import type { Transaction } from "@/hooks/useTransactions";

export interface BalanceChartMonth {
  month: string;
  receitas: number;
  despesas: number;
}

/**
 * Receitas e despesas dos 6 meses que terminam em `month/year` (mês 1-based),
 * para o gráfico "Balanço Mensal" do Dashboard.
 *
 * A busca é paginada até o fim (`fetchAllRows`). Seis meses de tudo já
 * passavam de 600 linhas em set/2026; quando cruzasse o teto de 1000 do
 * PostgREST, os meses mais antigos sairiam com barras menores, sem erro.
 */
export async function fetchBalanceChartData(
  year: number,
  month: number,
): Promise<BalanceChartMonth[]> {
  const months: { month: number; year: number; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(year, month - 1 - i, 1);
    months.push({
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    });
  }

  const lastMonth = months[months.length - 1];
  const startDate = startOfMonthYmd(months[0].year, months[0].month);
  const endDate = endOfMonthYmd(lastMonth.year, lastMonth.month);

  // Competência, não data da compra: o mesmo recorte que os cards de resumo
  // logo acima usam. Antes o gráfico buscava e agrupava por `date` bruto, então
  // uma compra de cartão de 25/08 que vence em 15/09 entrava na barra de agosto
  // e no card de setembro — o painel discordava de si mesmo, e não havia como
  // explicar a diferença (auditoria A12).
  const data = await fetchAllRows((from, to) =>
    supabase
      .from("transactions")
      .select("amount, type, date, due_date, credit_card_id, status, is_corporate_expense, is_refund, is_reimbursable, is_reimbursement, is_card_payment, is_provisional")
      .or(competenceRangeFilter(startDate, endDate))
      .order("id")
      .range(from, to),
  );

  return months.map((m) => {
    const key = `${m.year}-${String(m.month).padStart(2, "0")}`; // "YYYY-MM"
    const monthTransactions = data.filter(
      (t) => getCompetenceDate(t as Transaction).substring(0, 7) === key,
    );

    const receitas = monthTransactions
      .filter(isMonthlyIncome)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const despesasGross = monthTransactions
      .filter(isMonthlyExpense)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const refunds = monthTransactions
      .filter(isMonthlyExpenseRefund)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      month: m.label.charAt(0).toUpperCase() + m.label.slice(1),
      receitas,
      despesas: despesasGross - refunds,
    };
  });
}

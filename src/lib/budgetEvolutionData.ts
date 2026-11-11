import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { sumBudgetSpending } from "@/lib/transactionFilters";
import { competenceRangeFilter, getCompetenceDate } from "@/lib/reportUtils";

/**
 * "Gasto" de cada mês do ano (índice 0 = janeiro), para a linha do gráfico de
 * evolução do Planejamento. É o mesmo número do card "Total Gasto" da tela,
 * mês a mês: competência (cartão pelo vencimento) e `sumBudgetSpending`.
 *
 * Busca o ano inteiro, de todos os tipos, em páginas (`fetchAllRows`): um ano
 * passa folgado das 1000 linhas em que o PostgREST corta sem avisar. Não filtra
 * `type` no banco porque o estorno de cartão é gravado como receita e precisa
 * chegar até `sumBudgetSpending` para abater. Também não filtra `user_id`: o
 * card não filtra, quem recorta é o RLS.
 */
export async function fetchBudgetSpentByMonth(year: number): Promise<number[]> {
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("transactions")
      .select("amount, type, date, due_date, credit_card_id, status, is_corporate_expense, is_refund, is_reimbursable, is_reimbursement, is_card_payment, is_provisional")
      .or(competenceRangeFilter(`${year}-01-01`, `${year}-12-31`))
      .order("id")
      .range(from, to),
  );

  const byMonth: (typeof rows)[] = Array.from({ length: 12 }, () => []);
  for (const t of rows) {
    const competence = getCompetenceDate(t);
    if (Number(competence.substring(0, 4)) !== year) continue;
    const monthIndex = Number(competence.substring(5, 7)) - 1; // "MM" → 0-11
    if (monthIndex >= 0 && monthIndex < 12) byMonth[monthIndex].push(t);
  }

  return byMonth.map((monthRows) => {
    const { paid, forecast } = sumBudgetSpending(monthRows);
    return paid + forecast;
  });
}

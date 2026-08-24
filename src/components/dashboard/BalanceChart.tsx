import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TooltipProps } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDate } from "@/contexts/DateContext";
import { Loader2 } from "lucide-react";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { usePrivacyMode } from "@/contexts/PrivacyContext";
import { isMonthlyIncome, isMonthlyExpense, isMonthlyExpenseRefund } from "@/lib/transactionFilters";
import { competenceRangeFilter, getCompetenceDate } from "@/lib/reportUtils";
import { endOfMonthYmd, startOfMonthYmd } from "@/lib/dateUtils";
import type { Transaction } from "@/hooks/useTransactions";

interface MonthData {
  month: string;
  receitas: number;
  despesas: number;
}

export function BalanceChart() {
  const { user } = useAuth();
  const { month, year } = useDate();
  const fmt = useFormatCurrency();
  const { isHidden } = usePrivacyMode();

  const { data: chartData, isLoading } = useQuery({
    queryKey: ["balance-chart", user?.id, year, month],
    queryFn: async () => {
      // Generate last 6 months
      const months: { month: number; year: number; label: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(year, month - 1 - i, 1);
        months.push({
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          label: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        });
      }

      // Fetch all transactions for the 6-month period
      const lastMonth = months[months.length - 1];
      const startDate = startOfMonthYmd(months[0].year, months[0].month);
      const endDate = endOfMonthYmd(lastMonth.year, lastMonth.month);

      // Competência, não data da compra: o mesmo recorte que os cards de
      // resumo logo acima usam. Antes o gráfico buscava e agrupava por `date`
      // bruto, então uma compra de cartão de 25/08 que vence em 15/09 entrava
      // na barra de agosto e no card de setembro — o painel discordava de si
      // mesmo, e não havia como explicar a diferença (auditoria A12).
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, type, date, due_date, credit_card_id, status, is_corporate_expense, is_refund, is_reimbursable, is_reimbursement, is_card_payment, is_provisional")
        .or(competenceRangeFilter(startDate, endDate));

      if (error) throw error;

      // Aggregate by month
      const result: MonthData[] = months.map((m) => {
        const key = `${m.year}-${String(m.month).padStart(2, "0")}`; // "YYYY-MM"
        const monthTransactions =
          data?.filter((t) => getCompetenceDate(t as Transaction).substring(0, 7) === key) || [];

        const receitas = monthTransactions
          .filter(isMonthlyIncome)
          .reduce((sum, t) => sum + Number(t.amount), 0);

        const despesasGross = monthTransactions
          .filter(isMonthlyExpense)
          .reduce((sum, t) => sum + Number(t.amount), 0);

        const refunds = monthTransactions
          .filter(isMonthlyExpenseRefund)
          .reduce((sum, t) => sum + Number(t.amount), 0);

        const despesas = despesasGross - refunds;

        return {
          month: m.label.charAt(0).toUpperCase() + m.label.slice(1),
          receitas,
          despesas,
        };
      });

      return result;
    },
    enabled: !!user,
  });

  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      const receitas = payload.find((p) => p.dataKey === "receitas")?.value || 0;
      const despesas = payload.find((p) => p.dataKey === "despesas")?.value || 0;
      const resultado = receitas - despesas;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground mb-2">{label}</p>
          {payload.map((item, index) => (
            <p key={index} className="text-sm" style={{ color: item.color }}>
              {item.name}: {fmt(item.value ?? 0)}
            </p>
          ))}
          <div className="border-t border-border mt-2 pt-2">
            <p className={`text-sm font-medium ${resultado >= 0 ? "text-[hsl(var(--income))]" : "text-[hsl(var(--expense))]"}`}>
              Resultado: {fmt(resultado)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 shadow-card animate-slide-up">
        <h3 className="text-lg font-semibold text-foreground mb-4">Balanço Mensal</h3>
        <div className="h-[300px] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const data = chartData || [];

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-card animate-slide-up">
      <h3 className="text-lg font-semibold text-foreground mb-4">Balanço Mensal</h3>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickFormatter={(value) => isHidden ? "R$ ••" : `R$ ${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => <span className="text-sm text-foreground capitalize">{value}</span>}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="receitas" fill="hsl(var(--income))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="despesas" fill="hsl(var(--expense))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

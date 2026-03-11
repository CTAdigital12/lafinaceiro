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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDate } from "@/contexts/DateContext";
import { Loader2 } from "lucide-react";

interface MonthData {
  month: string;
  receitas: number;
  despesas: number;
}

export function BalanceChart() {
  const { user } = useAuth();
  const { month, year } = useDate();

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
      const startDate = `${months[0].year}-${String(months[0].month).padStart(2, "0")}-01`;
      const lastMonth = months[months.length - 1];
      const endDate = new Date(lastMonth.year, lastMonth.month, 0).toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("transactions")
        .select("amount, type, date, is_corporate_expense")
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;

      // Aggregate by month
      const result: MonthData[] = months.map((m) => {
        const monthTransactions = data?.filter((t) => {
          const tDate = new Date(t.date);
          return tDate.getMonth() + 1 === m.month && tDate.getFullYear() === m.year;
        }) || [];

        const receitas = monthTransactions
          .filter((t) => t.type === "income" && !t.is_corporate_expense)
          .reduce((sum, t) => sum + Number(t.amount), 0);

        const despesas = monthTransactions
          .filter((t) => t.type === "expense" && !t.is_corporate_expense)
          .reduce((sum, t) => sum + Number(t.amount), 0);

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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const receitas = payload.find((p: any) => p.dataKey === "receitas")?.value || 0;
      const despesas = payload.find((p: any) => p.dataKey === "despesas")?.value || 0;
      const resultado = receitas - despesas;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground mb-2">{label}</p>
          {payload.map((item: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: item.color }}>
              {item.name}: R$ {item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          ))}
          <div className="border-t border-border mt-2 pt-2">
            <p className={`text-sm font-medium ${resultado >= 0 ? "text-[hsl(var(--income))]" : "text-[hsl(var(--expense))]"}`}>
              Resultado: R$ {resultado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
              tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
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

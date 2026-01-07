import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface BudgetEvolutionChartProps {
  currentYear: number;
}

export function BudgetEvolutionChart({ currentYear }: BudgetEvolutionChartProps) {
  const { user } = useAuth();

  const { data: budgetsData, isLoading: loadingBudgets } = useQuery({
    queryKey: ["budgets-evolution", currentYear, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("budgets")
        .select("month, planned_amount")
        .eq("user_id", user.id)
        .eq("year", currentYear);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: transactionsData, isLoading: loadingTransactions } = useQuery({
    queryKey: ["transactions-evolution", currentYear, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const startDate = `${currentYear}-01-01`;
      const endDate = `${currentYear}-12-31`;
      const { data, error } = await supabase
        .from("transactions")
        .select("date, amount, type, is_corporate_expense")
        .eq("user_id", user.id)
        .eq("type", "expense")
        .eq("is_corporate_expense", false)
        .gte("date", startDate)
        .lte("date", endDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const chartData = useMemo(() => {
    const monthlyData = months.map((name, index) => ({
      name,
      month: index + 1,
      planejado: 0,
      gasto: 0,
    }));

    // Sum budgets by month
    budgetsData?.forEach((budget) => {
      const monthIndex = budget.month - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        monthlyData[monthIndex].planejado += Number(budget.planned_amount);
      }
    });

    // Sum transactions by month
    transactionsData?.forEach((transaction) => {
      const date = new Date(transaction.date);
      const monthIndex = date.getMonth();
      if (monthIndex >= 0 && monthIndex < 12) {
        monthlyData[monthIndex].gasto += Number(transaction.amount);
      }
    });

    return monthlyData;
  }, [budgetsData, transactionsData]);

  const isLoading = loadingBudgets || loadingTransactions;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
          <YAxis 
            className="text-xs" 
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value: number, name: string) => [
              `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
              name === "planejado" ? "Planejado" : "Gasto"
            ]}
          />
          <Legend 
            formatter={(value) => value === "planejado" ? "Planejado" : "Gasto"}
          />
          <Line
            type="monotone"
            dataKey="planejado"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="gasto"
            stroke="hsl(var(--chart-4))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--chart-4))", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

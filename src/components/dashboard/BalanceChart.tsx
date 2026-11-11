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
import { useAuth } from "@/contexts/AuthContext";
import { useDate } from "@/contexts/DateContext";
import { Loader2 } from "lucide-react";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { usePrivacyMode } from "@/contexts/PrivacyContext";
import { fetchBalanceChartData } from "@/lib/balanceChartData";

export function BalanceChart() {
  const { user } = useAuth();
  const { month, year } = useDate();
  const fmt = useFormatCurrency();
  const { isHidden } = usePrivacyMode();

  const { data: chartData, isLoading } = useQuery({
    queryKey: ["balance-chart", user?.id, year, month],
    queryFn: () => fetchBalanceChartData(year, month),
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

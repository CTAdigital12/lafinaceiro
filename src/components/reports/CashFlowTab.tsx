import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useTransactions } from "@/hooks/useTransactions";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, PiggyBank, Wallet } from "lucide-react";
import {
  filterPureExpenses,
  filterPureIncome,
  getCompetenceDate,
} from "@/lib/reportUtils";
import { formatCurrency } from "@/lib/utils";

export function CashFlowTab() {
  const { transactions, isLoading } = useTransactions(undefined, undefined, {
    showAll: true,
    loadedCount: 10000,
  });

  const { chartData, positiveMonths, totalMonths, avgSavingRate, periodBalance } = useMemo(() => {
    if (!transactions.length) return { chartData: [], positiveMonths: 0, totalMonths: 0, avgSavingRate: 0, periodBalance: 0 };

    const now = new Date();
    // Last 6 months only
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      months.push(format(subMonths(now, i), "yyyy-MM"));
    }

    const incomeByMonth: Record<string, number> = {};
    const expenseByMonth: Record<string, number> = {};

    const pureIncome = filterPureIncome(transactions);
    const pureExpenses = filterPureExpenses(transactions);

    for (const t of pureIncome) {
      const m = getCompetenceDate(t).substring(0, 7);
      incomeByMonth[m] = (incomeByMonth[m] || 0) + Number(t.amount);
    }

    for (const t of pureExpenses) {
      const m = getCompetenceDate(t).substring(0, 7);
      if (t.is_refund) {
        expenseByMonth[m] = (expenseByMonth[m] || 0) - Number(t.amount);
      } else {
        expenseByMonth[m] = (expenseByMonth[m] || 0) + Number(t.amount);
      }
    }

    let cumBalance = 0;
    let posCount = 0;
    let savingRateSum = 0;
    let monthsWithIncome = 0;

    const data = months.map((m) => {
      const income = incomeByMonth[m] || 0;
      const expense = Math.max(0, expenseByMonth[m] || 0);
      const balance = income - expense;
      cumBalance += balance;

      if (balance > 0) posCount++;
      if (income > 0) {
        savingRateSum += ((income - expense) / income) * 100;
        monthsWithIncome++;
      }

      const [y, mo] = m.split("-");
      const label = format(new Date(Number(y), Number(mo) - 1), "MMM yy", { locale: ptBR });

      return {
        name: label,
        receitas: Math.round(income),
        despesas: Math.round(expense),
        saldoMensal: Math.round(balance),
        saldo: Math.round(cumBalance),
      };
    });

    return {
      chartData: data,
      positiveMonths: posCount,
      totalMonths: months.length,
      avgSavingRate: monthsWithIncome > 0 ? Math.round(savingRateSum / monthsWithIncome) : 0,
      periodBalance: cumBalance,
    };
  }, [transactions]);

  if (isLoading) {
    return <div className="h-[300px] flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-medium text-foreground mb-1 capitalize">{label}</p>
        {payload.map((p: any) => {
          const isNegative = p.dataKey === "saldo" && p.value < 0;
          return (
            <p key={p.dataKey} style={{ color: isNegative ? "hsl(var(--destructive))" : p.color }}>
              {p.name}: {formatCurrency(p.value)}
            </p>
          );
        })}
      </div>
    );
  };

  const balanceIsPositive = periodBalance >= 0;

  return (
    <div className="space-y-4">
      {/* Insight Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Meses +</span>
            </div>
            <p className="text-xl font-bold text-foreground">
              {positiveMonths}<span className="text-sm font-normal text-muted-foreground">/{totalMonths}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <PiggyBank className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Poupança</span>
            </div>
            <p className="text-xl font-bold text-foreground">
              {avgSavingRate}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              {balanceIsPositive ? (
                <Wallet className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <span className="text-xs text-muted-foreground">Saldo</span>
            </div>
            <p className={`text-lg font-bold ${balanceIsPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {formatCurrency(periodBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Evolução dos últimos 6 meses</h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} barSize={24} />
                <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} barSize={24} />
                <Line
                  dataKey="saldo"
                  name="Saldo Acum."
                  type="monotone"
                  strokeWidth={2.5}
                  dot={{ r: 4, strokeWidth: 2 }}
                  stroke="hsl(var(--chart-4))"
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      stroke={entry.saldo >= 0 ? "hsl(142, 71%, 45%)" : "hsl(var(--destructive))"}
                    />
                  ))}
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

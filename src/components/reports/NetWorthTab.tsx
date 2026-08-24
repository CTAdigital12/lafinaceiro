import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useAccounts } from "@/hooks/useAccounts";
import { useInvestments, getAssetPatrimony } from "@/hooks/useInvestments";
import { useCreditCards } from "@/hooks/useCreditCards";
import { usePendingInstallments } from "@/hooks/usePendingInstallments";
import { useTransactions } from "@/hooks/useTransactions";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { TooltipProps } from "recharts";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Landmark, CreditCard, TrendingUp, Wallet } from "lucide-react";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { filterPureExpenses, filterPureIncome, getCompetenceDate } from "@/lib/reportUtils";

export function NetWorthTab() {
  const formatCurrency = useFormatCurrency();
  const { accounts, totalBalance } = useAccounts();
  const { assets, totalPatrimony: investmentTotal } = useInvestments();
  const { creditCards, totalInvoice } = useCreditCards();
  const { summary: pendingSummary } = usePendingInstallments();
  const { transactions, isLoading } = useTransactions(undefined, undefined, {
    showAll: true,
    loadedCount: 10000,
  });

  const totalAssets = totalBalance + investmentTotal;
  const totalLiabilities = totalInvoice + pendingSummary.totalAmount;
  const netWorth = totalAssets - totalLiabilities;

  // Evolution chart: approximate net worth over last 12 months
  // by working backwards from current snapshot using monthly deltas
  const chartData = useMemo(() => {
    if (!transactions.length) return [];

    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      months.push(format(subMonths(now, i), "yyyy-MM"));
    }

    const pureIncome = filterPureIncome(transactions);
    const pureExpenses = filterPureExpenses(transactions);

    // Calculate net flow per month
    const netFlowByMonth: Record<string, number> = {};
    for (const t of pureIncome) {
      const m = getCompetenceDate(t).substring(0, 7);
      netFlowByMonth[m] = (netFlowByMonth[m] || 0) + Number(t.amount);
    }
    for (const t of pureExpenses) {
      const m = getCompetenceDate(t).substring(0, 7);
      if (t.is_refund) {
        netFlowByMonth[m] = (netFlowByMonth[m] || 0) + Number(t.amount);
      } else {
        netFlowByMonth[m] = (netFlowByMonth[m] || 0) - Number(t.amount);
      }
    }

    // Work backwards from current net worth
    const currentMonthKey = months[months.length - 1];
    const data: { name: string; patrimonio: number }[] = [];

    let runningNetWorth = netWorth;
    // Process from newest to oldest
    for (let i = months.length - 1; i >= 0; i--) {
      const m = months[i];
      const [y, mo] = m.split("-");
      const label = format(new Date(Number(y), Number(mo) - 1), "MMM yy", { locale: ptBR });

      data.unshift({ name: label, patrimonio: Math.round(runningNetWorth) });

      // Subtract this month's net flow to get previous month's value
      if (i > 0) {
        runningNetWorth -= (netFlowByMonth[m] || 0);
      }
    }

    return data;
  }, [transactions, netWorth]);

  if (isLoading) {
    return <div className="h-[300px] flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-2 shadow-lg text-sm">
        <p className="font-medium capitalize">{label}</p>
        <p className="text-foreground">{formatCurrency(payload[0].value ?? 0)}</p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Net Worth highlight */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6 pb-6 text-center">
          <p className="text-sm text-muted-foreground mb-1">Patrimônio Líquido</p>
          <p className={`text-3xl font-bold ${netWorth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {formatCurrency(netWorth)}
          </p>
        </CardContent>
      </Card>

      {/* Assets & Liabilities */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Ativos</span>
            </div>
            <p className="text-lg font-bold text-foreground mb-2">{formatCurrency(totalAssets)}</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span><Landmark className="h-3 w-3 inline mr-1" />Contas</span>
                <span>{formatCurrency(totalBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span><TrendingUp className="h-3 w-3 inline mr-1" />Investimentos</span>
                <span>{formatCurrency(investmentTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Passivos</span>
            </div>
            <p className="text-lg font-bold text-foreground mb-2">{formatCurrency(totalLiabilities)}</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Faturas Abertas</span>
                <span>{formatCurrency(totalInvoice)}</span>
              </div>
              <div className="flex justify-between">
                <span>Parcelas Futuras</span>
                <span>{formatCurrency(pendingSummary.totalAmount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evolution Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Evolução Patrimonial (12 meses)</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="patrimonyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="patrimonio" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#patrimonyGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

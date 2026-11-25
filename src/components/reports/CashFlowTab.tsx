import { useMemo, useState } from "react";
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
import type { TooltipProps } from "recharts";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, PiggyBank, Wallet, Landmark } from "lucide-react";
import { buildCashFlowBridge, buildCashFlowSeries, type CashFlowBridge } from "@/lib/cashFlowSeries";
import { todayYmd } from "@/lib/dateUtils";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const PERIOD_OPTIONS = [3, 6, 12] as const;
type Period = (typeof PERIOD_OPTIONS)[number];

export function CashFlowTab() {
  const formatCurrency = useFormatCurrency();
  const [period, setPeriod] = useState<Period>(6);
  const { transactions, isLoading } = useTransactions(undefined, undefined, {
    showAll: true,
    loadedCount: 10000,
  });

  const { chartData, positiveMonths, totalMonths, avgSavingRate, periodBalance, lastMonthBalance, bridge } = useMemo(() => {
    if (!transactions.length) return { chartData: [], positiveMonths: 0, totalMonths: 0, avgSavingRate: 0, periodBalance: 0, lastMonthBalance: 0, bridge: null as CashFlowBridge | null };

    const now = new Date();
    // Os últimos `period` meses, terminando no mês atual.
    const months: string[] = [];
    for (let i = period - 1; i >= 0; i--) {
      months.push(format(subMonths(now, i), "yyyy-MM"));
    }

    const {
      months: rows,
      positiveMonths,
      totalMonths,
      avgSavingRate,
      periodBalance,
      lastMonthBalance,
    } = buildCashFlowSeries(transactions, months);

    // O acumulado acima é o orçamento PESSOAL; a ponte mostra quanto disso
    // ficou de fato na conta e por que a diferença (aportes, empresa).
    const bridge = buildCashFlowBridge(transactions, months, periodBalance, todayYmd());

    const data = rows.map((row) => {
      const [y, mo] = row.month.split("-");
      const label = format(new Date(Number(y), Number(mo) - 1), "MMM yy", { locale: ptBR });

      return {
        name: label,
        receitas: Math.round(row.income),
        // Negativo é legítimo: no mês em que os estornos superam as despesas,
        // o líquido é entrada de dinheiro (achado M2).
        despesas: Math.round(row.netExpense),
        saldoMensal: Math.round(row.balance),
        saldo: Math.round(row.cumulativeBalance),
      };
    });

    return {
      chartData: data,
      positiveMonths,
      totalMonths,
      avgSavingRate,
      periodBalance,
      lastMonthBalance,
      bridge,
    };
  }, [transactions, period]);

  if (isLoading) {
    return <div className="h-[300px] flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-medium text-foreground mb-1 capitalize">{label}</p>
        {payload.map((p) => {
          const isNegative =
            (p.dataKey === "saldo" || p.dataKey === "saldoMensal") && (p.value ?? 0) < 0;
          return (
            <p key={p.dataKey} style={{ color: isNegative ? "hsl(var(--destructive))" : p.color }}>
              {p.name}: {formatCurrency(p.value ?? 0)}
            </p>
          );
        })}
      </div>
    );
  };

  const balanceIsPositive = periodBalance >= 0;

  return (
    <div className="space-y-4">
      {/* O período vale para os cards E para o gráfico. */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Período</span>
        <ToggleGroup
          type="single"
          size="sm"
          value={String(period)}
          onValueChange={(v) => v && setPeriod(Number(v) as Period)}
        >
          {PERIOD_OPTIONS.map((m) => (
            <ToggleGroupItem key={m} value={String(m)} aria-label={`Últimos ${m} meses`}>
              {m} meses
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Insight Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
              {lastMonthBalance >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <span className="text-xs text-muted-foreground">Último mês</span>
            </div>
            <p className={`text-lg font-bold ${lastMonthBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {formatCurrency(lastMonthBalance)}
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
              <span className="text-xs text-muted-foreground">Acumulado pessoal</span>
            </div>
            <p className={`text-lg font-bold ${balanceIsPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {formatCurrency(periodBalance)}
            </p>
          </CardContent>
        </Card>
        {bridge && (
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Landmark className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Sobrou na conta</span>
              </div>
              <p className={`text-lg font-bold ${bridge.accountNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                {formatCurrency(bridge.accountNet)}
              </p>
              {/* A ponte a partir do acumulado pessoal: os três itens fecham no valor acima. */}
              <dl className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>Pessoal</dt>
                  <dd className="tabular-nums">{formatCurrency(bridge.personalBalance)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Aportes</dt>
                  <dd className="tabular-nums">{formatCurrency(-bridge.investmentContributions)}</dd>
                </div>
                <div className="flex justify-between gap-2" title="Gastos adiantados para a empresa menos reembolsos recebidos no período, e diferenças entre a compra no cartão e o pagamento da fatura">
                  <dt>Empresa e defasagens</dt>
                  <dd className="tabular-nums">{formatCurrency(bridge.companyAndTiming)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Evolução dos últimos {period} meses</h3>
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
                {/* Entrou − saiu no próprio mês: a diferença entre as duas barras. */}
                <Line
                  dataKey="saldoMensal"
                  name="Saldo do mês"
                  type="monotone"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 3, strokeWidth: 2 }}
                  stroke="hsl(var(--chart-5))"
                />
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

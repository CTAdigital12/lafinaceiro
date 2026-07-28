import { useMemo, useState, type ReactNode } from "react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarClock, CreditCard, Layers, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ListSearchInput } from "@/components/ui/list-search-input";
import { ListSortButtons } from "@/components/ui/list-sort-buttons";
import { useListSearchSort } from "@/hooks/useListSearchSort";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { usePrivacyMode } from "@/contexts/PrivacyContext";
import { useInstallmentsReport } from "@/hooks/useInstallmentsReport";
import {
  buildInstallmentGroups,
  buildInstallmentsOverview,
  buildMonthlyInstallments,
  earliestInstallmentMonth,
  monthLabel,
  usableHistoryWindows,
  type InstallmentGroupSummary,
} from "@/lib/installmentsReport";
import { cn } from "@/lib/utils";

/**
 * Duas séries, uma medida só: parcela que já caiu vs. parcela que ainda vai
 * cair. O par azul/âmbar foi validado (banda de luminosidade, separação para
 * daltonismo e contraste) contra as duas superfícies do app — claro e escuro.
 * O âmbar é o --chart-4 escurecido: o original (47% de luz) não alcança 3:1 no
 * tema claro.
 */
const COLOR_REALIZADO = "hsl(var(--chart-1))";
const COLOR_PREVISTO = "hsl(45 93% 36%)";

/** Horizontes de previsão oferecidos, em meses à frente. "Tudo" vai até a
 *  última parcela conhecida. */
const FORWARD_OPTIONS = [6, 12, 24] as const;

/** Meses de passado mostrados junto, só como contexto para enxergar a
 *  tendência — o seletor é do futuro, que é o que interessa aqui. */
const HISTORY_MONTHS = 3;

type Horizon = number | "all";
type GroupSortKey = "remaining" | "installment" | "next" | "description";

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "expense";
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p
          className={cn(
            "text-lg font-bold",
            tone === "expense" ? "text-expense" : "text-foreground"
          )}
        >
          {value}
        </p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function GroupRow({ group }: { group: InstallmentGroupSummary }) {
  const formatCurrency = useFormatCurrency();
  const progress =
    group.totalInstallments > 0
      ? Math.min(100, (group.paidCount / group.totalInstallments) * 100)
      : 0;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        {group.categoryIcon ? (
          <span className="text-base">{group.categoryIcon}</span>
        ) : (
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{group.description}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{group.cardName ?? "Conta / boleto"}</span>
          <span>•</span>
          <span className="whitespace-nowrap">
            {group.paidCount}/{group.totalInstallments} pagas
          </span>
          {group.nextMonth && (
            <>
              <span>•</span>
              <span className="whitespace-nowrap capitalize">
                até {monthLabel(group.lastMonth)}
              </span>
            </>
          )}
        </div>
        <Progress value={progress} className="h-1.5 mt-1.5" />
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-expense">
          {formatCurrency(group.installmentAmount)}
        </p>
        <p className="text-xs text-muted-foreground">
          falta {formatCurrency(group.remainingAmount)}
        </p>
        {!group.isActive && (
          <Badge variant="outline" className="text-xs mt-1">
            quitado
          </Badge>
        )}
      </div>
    </div>
  );
}

export function InstallmentsTab() {
  const formatCurrency = useFormatCurrency();
  const { isHidden } = usePrivacyMode();
  const { rows, isLoading } = useInstallmentsReport();
  const [horizon, setHorizon] = useState<Horizon>("all");
  const [showOnlyActive, setShowOnlyActive] = useState(true);

  const currentMonth = format(new Date(), "yyyy-MM");

  const forwardOptions = useMemo(
    () => usableForwardWindows(FORWARD_OPTIONS, rows, currentMonth),
    [rows, currentMonth]
  );
  const lastMonth = useMemo(() => latestInstallmentMonth(rows), [rows]);

  const { points, groups, overview } = useMemo(() => {
    // A série completa manda nos KPIs: "total em aberto" e "livre em X meses"
    // são do compromisso inteiro, não do pedaço que está visível no gráfico.
    const full = buildMonthlyInstallments(rows, {
      currentMonth,
      monthsBack: HISTORY_MONTHS,
    });
    const grouped = buildInstallmentGroups(rows, { currentMonth });
    const visible =
      horizon === "all"
        ? full
        : buildMonthlyInstallments(rows, {
            currentMonth,
            monthsBack: HISTORY_MONTHS,
            monthsForward: horizon,
          });

    return {
      points: visible,
      groups: grouped,
      overview: buildInstallmentsOverview(full, grouped, { currentMonth }),
    };
  }, [rows, currentMonth, horizon]);

  const visibleGroups = useMemo(
    () => (showOnlyActive ? groups.filter((g) => g.isActive) : groups),
    [groups, showOnlyActive]
  );

  const {
    query,
    setQuery,
    sort,
    toggleSort,
    items: sortedGroups,
  } = useListSearchSort<InstallmentGroupSummary, GroupSortKey>(visibleGroups, {
    searchAccessors: [(g) => g.description, (g) => g.cardName, (g) => g.categoryName],
    sortAccessors: {
      remaining: (g) => g.remainingAmount,
      installment: (g) => g.installmentAmount,
      next: (g) => g.nextMonth ?? g.lastMonth,
      description: (g) => g.description,
    },
    initialSort: { field: "remaining", direction: "desc" },
  });

  if (isLoading) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Layers className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhuma compra parcelada encontrada.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Parcelamentos criados em cartão ou conta aparecem aqui automaticamente.
          </p>
        </CardContent>
      </Card>
    );
  }

  const currentLabel = format(parse(currentMonth, "yyyy-MM", new Date()), "MMM/yy", {
    locale: ptBR,
  });

  const futurePoints = points.filter((p) => p.isFuture);
  const averageLine = overview.nextMonthsAverage;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-medium text-foreground mb-1 capitalize">{point.label}</p>
        <p style={{ color: point.isFuture ? COLOR_PREVISTO : COLOR_REALIZADO }}>
          {point.isFuture ? "Previsto" : "Realizado"}: {formatCurrency(point.total)}
        </p>
        <p className="text-muted-foreground text-xs mt-1">
          {point.count} parcela{point.count === 1 ? "" : "s"}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={<CalendarClock className="h-4 w-4 text-blue-500" />}
          label="Parcelas deste mês"
          value={formatCurrency(overview.currentMonthAmount)}
          hint={`${overview.currentMonthCount} parcela${overview.currentMonthCount === 1 ? "" : "s"}`}
          tone="expense"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4 text-amber-500" />}
          label={
            overview.nextMonthsWindow > 0
              ? `Média próx. ${overview.nextMonthsWindow}m`
              : "Média futura"
          }
          value={formatCurrency(overview.nextMonthsAverage)}
          hint={
            overview.peak
              ? `pico ${overview.peak.label} · ${formatCurrency(overview.peak.total)}`
              : undefined
          }
        />
        <KpiCard
          icon={<Layers className="h-4 w-4 text-expense" />}
          label="Total em aberto"
          value={formatCurrency(overview.openAmount)}
          hint="deste mês em diante"
          tone="expense"
        />
        <KpiCard
          icon={<CreditCard className="h-4 w-4 text-emerald-500" />}
          label="Parcelamentos ativos"
          value={String(overview.activeGroups)}
          hint={
            overview.monthsUntilFree > 0
              ? `livre em ${overview.monthsUntilFree} ${overview.monthsUntilFree === 1 ? "mês" : "meses"}`
              : "sem parcelas futuras"
          }
        />
      </div>

      {/* Gráfico mês a mês */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Parcelamento mês a mês
              </h3>
              <p className="text-xs text-muted-foreground capitalize">
                {points[0].label} → {points[points.length - 1].label}
              </p>
            </div>
            <ToggleGroup
              type="single"
              size="sm"
              value={String(horizon)}
              onValueChange={(v) => v && setHorizon(v === "all" ? "all" : Number(v))}
              className="justify-start"
            >
              {forwardOptions.map(({ months, enabled }) => (
                <ToggleGroupItem
                  key={months}
                  value={String(months)}
                  disabled={!enabled}
                  aria-label={`Próximos ${months} meses`}
                  title={
                    enabled
                      ? `Próximos ${months} meses`
                      : `Suas parcelas terminam em ${lastMonth ? monthLabel(lastMonth) : "breve"} — use "Tudo"`
                  }
                >
                  {months}m
                </ToggleGroupItem>
              ))}
              <ToggleGroupItem value="all" aria-label="Toda a previsão" title="Até a última parcela">
                Tudo
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  tickFormatter={(v) => (isHidden ? "•••" : `${(v / 1000).toFixed(0)}k`)}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.4)" }} />
                <Legend verticalAlign="bottom" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                {averageLine > 0 && (
                  <ReferenceLine
                    y={averageLine}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    label={{
                      value: "média futura",
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                )}
                {futurePoints.length > 0 && (
                  <ReferenceLine
                    x={currentLabel}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 3"
                  />
                )}
                {/* Empilhadas porque só uma delas tem valor em cada mês: assim o
                    mês ocupa uma barra só, e não meia barra com um vão do lado. */}
                <Bar
                  dataKey="realizado"
                  name="Realizado"
                  stackId="parcelas"
                  fill={COLOR_REALIZADO}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="previsto"
                  name="Previsto"
                  stackId="parcelas"
                  fill={COLOR_PREVISTO}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Compras parceladas */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Compras parceladas
              </h3>
              <p className="text-xs text-muted-foreground">
                {sortedGroups.length} parcelamento{sortedGroups.length === 1 ? "" : "s"}
                {showOnlyActive ? " em andamento" : " (inclui quitados)"}
              </p>
            </div>
            <ToggleGroup
              type="single"
              size="sm"
              value={showOnlyActive ? "ativos" : "todos"}
              onValueChange={(v) => v && setShowOnlyActive(v === "ativos")}
              className="justify-start"
            >
              <ToggleGroupItem value="ativos">Em andamento</ToggleGroupItem>
              <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2 mb-3">
            <ListSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar por descrição, cartão ou categoria..."
            />
            <ListSortButtons
              options={[
                { key: "remaining", label: "Falta pagar" },
                { key: "installment", label: "Valor da parcela" },
                { key: "next", label: "Próxima" },
                { key: "description", label: "Descrição" },
              ]}
              activeField={sort.field}
              direction={sort.direction}
              onSort={toggleSort}
            />
          </div>

          {sortedGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum parcelamento encontrado.
            </p>
          ) : (
            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-2">
                {sortedGroups.map((group) => (
                  <GroupRow key={group.key} group={group} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

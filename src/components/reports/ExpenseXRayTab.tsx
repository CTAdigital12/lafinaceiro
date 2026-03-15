import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTransactions } from "@/hooks/useTransactions";
import { useCategories } from "@/hooks/useCategories";
import { useDate } from "@/contexts/DateContext";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { filterPureExpenses, getCompetenceDate } from "@/lib/reportUtils";
import { formatCurrency } from "@/lib/utils";
import { RefundReport } from "./RefundReport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ExpenseXRayTab() {
  const { currentDate: ctxDate } = useDate();
  const [currentDate, setCurrentDate] = useState(ctxDate);

  const { transactions, isLoading } = useTransactions(undefined, undefined, {
    showAll: true,
    loadedCount: 10000,
  });

  const { categories } = useCategories();

  const currentMonth = format(currentDate, "yyyy-MM");
  const prevMonth = format(subMonths(currentDate, 1), "yyyy-MM");

  const { top5, treemapData, biggestExpenses } = useMemo(() => {
    if (!transactions.length) return { top5: [], treemapData: [], biggestExpenses: [] };

    const pureExpenses = filterPureExpenses(transactions);

    // Group by category and month
    const byCatMonth: Record<string, Record<string, number>> = {};
    for (const t of pureExpenses) {
      if (t.is_refund) continue;
      const m = getCompetenceDate(t).substring(0, 7);
      const catId = t.category_id || "uncategorized";
      if (!byCatMonth[catId]) byCatMonth[catId] = {};
      byCatMonth[catId][m] = (byCatMonth[catId][m] || 0) + Number(t.amount);
    }

    // Top 5 categories for current month with MoM comparison
    const currentCats = Object.entries(byCatMonth)
      .map(([catId, months]) => ({
        catId,
        current: months[currentMonth] || 0,
        previous: months[prevMonth] || 0,
      }))
      .filter((c) => c.current > 0)
      .sort((a, b) => b.current - a.current)
      .slice(0, 5);

    const top5Result = currentCats.map((c) => {
      const cat = categories.find((cat) => cat.id === c.catId);
      const change = c.previous > 0 ? ((c.current - c.previous) / c.previous) * 100 : null;
      return {
        name: cat?.name || "Sem categoria",
        icon: cat?.icon || "📦",
        color: cat?.color || "#6B7280",
        current: c.current,
        change,
      };
    });

    // Treemap: parent categories for current month
    const parentTotals: Record<string, { name: string; value: number; color: string }> = {};
    for (const t of pureExpenses) {
      if (t.is_refund) continue;
      const m = getCompetenceDate(t).substring(0, 7);
      if (m !== currentMonth) continue;

      const cat = categories.find((c) => c.id === t.category_id);
      const parentId = cat?.parent_id || t.category_id || "uncategorized";
      const parentCat = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : cat;

      if (!parentTotals[parentId]) {
        parentTotals[parentId] = {
          name: parentCat?.name || "Sem categoria",
          value: 0,
          color: parentCat?.color || "#6B7280",
        };
      }
      parentTotals[parentId].value += Number(t.amount);
    }

    const treemap = Object.values(parentTotals)
      .filter((v) => v.value > 0)
      .sort((a, b) => b.value - a.value);

    // Biggest individual expenses
    const monthExpenses = pureExpenses
      .filter((t) => !t.is_refund && getCompetenceDate(t).substring(0, 7) === currentMonth)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 5);

    const biggest = monthExpenses.map((t) => {
      const cat = categories.find((c) => c.id === t.category_id);
      return {
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        category: cat?.name || "Sem categoria",
        categoryIcon: cat?.icon || "📦",
      };
    });

    return { top5: top5Result, treemapData: treemap, biggestExpenses: biggest };
  }, [transactions, categories, currentMonth, prevMonth]);

  if (isLoading) {
    return <div className="h-[300px] flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const TreemapTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg p-2 shadow-lg text-sm">
        <p className="font-medium">{item.name}</p>
        <p className="text-muted-foreground">{formatCurrency(item.value)}</p>
      </div>
    );
  };

  const TREEMAP_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "#8B5CF6",
    "#F59E0B",
    "#06B6D4",
  ];

  return (
    <Tabs defaultValue="analise" className="space-y-4">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="analise">Análise</TabsTrigger>
        <TabsTrigger value="reembolsos">Reembolsos</TabsTrigger>
      </TabsList>

      <TabsContent value="analise" className="space-y-4">
        {/* Month Nav */}
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate((d) => subMonths(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center font-medium capitalize text-sm">
            {format(currentDate, "MMMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate((d) => {
            const next = new Date(d);
            next.setMonth(next.getMonth() + 1);
            return next;
          })}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Top 5 Categories MoM */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Top 5 Categorias (vs mês anterior)</h3>
            {top5.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sem despesas neste mês</p>
            ) : (
              <div className="space-y-3">
                {top5.map((cat) => (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="text-lg">{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cat.name}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(cat.current)}</p>
                    </div>
                    {cat.change !== null && (
                      <Badge
                        variant="outline"
                        className={
                          cat.change > 0
                            ? "text-red-600 border-red-200 dark:text-red-400 dark:border-red-800"
                            : "text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800"
                        }
                      >
                        {cat.change > 0 ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {cat.change > 0 ? "+" : ""}
                        {Math.round(cat.change)}%
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Treemap */}
        {treemapData.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Composição de Gastos</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    data={treemapData.map((d, i) => ({ ...d, fill: TREEMAP_COLORS[i % TREEMAP_COLORS.length] }))}
                    dataKey="value"
                    nameKey="name"
                    stroke="hsl(var(--border))"
                    fill="hsl(var(--chart-1))"
                  >
                    <Tooltip content={<TreemapTooltip />} />
                  </Treemap>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Capital Leakage */}
        {biggestExpenses.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Maiores Gastos Individuais
              </h3>
              <div className="space-y-2">
                {biggestExpenses.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <span className="text-base">{e.categoryIcon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{e.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.category} • {format(new Date(e.date), "dd/MM")}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                      {formatCurrency(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="reembolsos">
        <RefundReport />
      </TabsContent>
    </Tabs>
  );
}

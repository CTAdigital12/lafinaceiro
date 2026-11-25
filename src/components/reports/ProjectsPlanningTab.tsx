import { useMemo, useState } from "react";
import { useDate } from "@/contexts/DateContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTransactions } from "@/hooks/useTransactions";
import { useProjects } from "@/hooks/useProjects";
import { useCategories } from "@/hooks/useCategories";
import type { Budget } from "@/hooks/useBudgets";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { buildBudgetPeriodReport, type MonthKey } from "@/lib/budgetPeriodReport";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BudgetCurrentMonth } from "./planning/BudgetCurrentMonth";
import { BudgetChart } from "./planning/BudgetChart";
import { BudgetAccumulatedCard } from "./planning/BudgetAccumulatedCard";
import { ProjectsSection } from "./planning/ProjectsSection";

const PERIOD_OPTIONS = [3, 6, 12] as const;
type Period = (typeof PERIOD_OPTIONS)[number];

export function ProjectsPlanningTab() {
  const { month, year } = useDate();
  const { user } = useAuth();
  const { categories } = useCategories();
  const { transactions, isLoading: txLoading } = useTransactions(undefined, undefined, {
    showAll: true,
    loadedCount: 10000,
  });
  const { activeProjects } = useProjects();
  const [period, setPeriod] = useState<Period>(6);

  // Os últimos `period` meses, terminando no mês selecionado no topo do app.
  const monthKeys = useMemo(() => {
    const keys: MonthKey[] = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = subMonths(new Date(year, month - 1), i);
      keys.push({
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        key: format(d, "yyyy-MM"),
        label: format(d, "MMM/yy", { locale: ptBR }),
      });
    }
    return keys;
  }, [month, year, period]);

  const firstKey = monthKeys[0].key;
  const lastKey = monthKeys[monthKeys.length - 1].key;

  // Metas do período, em páginas: 12 meses atravessam dois anos, e o recorte por
  // ano inteiro passa das 1000 linhas em que o PostgREST corta sem avisar.
  // A categoria vem junto porque a árvore e o total por folha dependem do pai.
  const { data: periodBudgets = [], isLoading: budgetsLoading } = useQuery({
    queryKey: ["budgets-period", user?.id, firstKey, lastKey],
    queryFn: async () => {
      const first = monthKeys[0];
      const last = monthKeys[monthKeys.length - 1];
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from("budgets")
          .select("*, categories (id, name, icon, color, parent_id)")
          .gte("year", first.year)
          .lte("year", last.year)
          .order("id")
          .range(from, to),
      );
      return (rows as Budget[]).filter((b) => {
        const bk = `${b.year}-${String(b.month).padStart(2, "0")}`;
        return bk >= firstKey && bk <= lastKey;
      });
    },
    enabled: !!user,
  });

  const report = useMemo(
    () => buildBudgetPeriodReport(periodBudgets, transactions, categories, monthKeys),
    [periodBudgets, transactions, categories, monthKeys],
  );

  const periodLabel = `${monthKeys[0].label} a ${monthKeys[monthKeys.length - 1].label}`;

  const isLoading = budgetsLoading || txLoading;

  if (isLoading) {
    return <div className="h-[300px] flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      {/* O período vale para o card, o gráfico e o quadro. */}
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

      <BudgetAccumulatedCard
        title={`Acumulado — ${period} meses`}
        accumulated={{
          totalPlanned: report.totalPlanned,
          totalActual: report.totalActual,
          pct: report.pct,
          diff: report.diff,
        }}
      />

      <BudgetChart title={`Evolução Orçado vs Realizado (${period} meses)`} data={report.months} />

      <BudgetCurrentMonth periodLabel={`${periodLabel} (acumulado)`} items={report.items} />

      {/* Projects Section */}
      <ProjectsSection projects={activeProjects} />
    </div>
  );
}

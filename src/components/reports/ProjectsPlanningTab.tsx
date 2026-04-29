import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useDate } from "@/contexts/DateContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTransactions } from "@/hooks/useTransactions";
import { useProjects } from "@/hooks/useProjects";
import { useCategories } from "@/hooks/useCategories";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { filterPureExpenses, getCompetenceDate } from "@/lib/reportUtils";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Target, FolderKanban, AlertCircle, CheckCircle2, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { BudgetCurrentMonth } from "./planning/BudgetCurrentMonth";
import { BudgetChart } from "./planning/BudgetChart";
import { BudgetAccumulatedCard } from "./planning/BudgetAccumulatedCard";
import { ProjectsSection } from "./planning/ProjectsSection";

interface BudgetRow {
  id: string;
  category_id: string | null;
  month: number;
  year: number;
  planned_amount: number;
}

export function ProjectsPlanningTab() {
  const formatCurrency = useFormatCurrency();
  const { month, year } = useDate();
  const { user } = useAuth();
  const { categories } = useCategories();
  const { transactions, isLoading: txLoading } = useTransactions(undefined, undefined, {
    showAll: true,
    loadedCount: 10000,
  });
  const { activeProjects } = useProjects();

  // Generate last 6 month keys
  const monthKeys = useMemo(() => {
    const keys: { month: number; year: number; key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(year, month - 1), i);
      keys.push({
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        key: format(d, "yyyy-MM"),
        label: format(d, "MMM/yy", { locale: ptBR }),
      });
    }
    return keys;
  }, [month, year]);

  // Fetch 6 months of budgets directly
  const { data: allBudgets = [], isLoading: budgetsLoading } = useQuery({
    queryKey: ["budgets-6m", user?.id, monthKeys[0]?.key, monthKeys[5]?.key],
    queryFn: async () => {
      const firstM = monthKeys[0];
      const lastM = monthKeys[5];

      const { data, error } = await supabase
        .from("budgets")
        .select("id, category_id, month, year, planned_amount")
        .gte("year", firstM.year)
        .lte("year", lastM.year)
        .order("month");

      if (error) throw error;

      // Filter to exact range
      return (data as BudgetRow[]).filter((b) => {
        const bk = `${b.year}-${String(b.month).padStart(2, "0")}`;
        return bk >= firstM.key && bk <= lastM.key;
      });
    },
    enabled: !!user,
  });

  const currentMonthKey = `${year}-${String(month).padStart(2, "0")}`;

  // Current month budgets
  const currentBudgets = useMemo(
    () => allBudgets.filter((b) => b.month === month && b.year === year),
    [allBudgets, month, year]
  );

  // Pure expenses grouped by month-key and category
  const expensesByMonthCat = useMemo(() => {
    const pureExpenses = filterPureExpenses(transactions).filter((t) => !t.is_refund);
    const map: Record<string, Record<string, number>> = {};
    for (const t of pureExpenses) {
      const mk = getCompetenceDate(t).substring(0, 7);
      if (!map[mk]) map[mk] = {};
      const catId = t.category_id || "uncategorized";
      map[mk][catId] = (map[mk][catId] || 0) + Number(t.amount);
    }
    return map;
  }, [transactions]);

  // Build parent-grouped budget items for current month
  const { parentItems, leafItems } = useMemo(() => {
    if (!currentBudgets.length) return { parentItems: [], leafItems: [] };

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const spentMap = expensesByMonthCat[currentMonthKey] || {};

    // Find which category IDs are parents (have children in budgets)
    const childCatIds = new Set<string>();
    const parentCatIds = new Set<string>();

    for (const b of currentBudgets) {
      const cat = catMap.get(b.category_id || "");
      if (cat?.parent_id) {
        childCatIds.add(cat.id);
        parentCatIds.add(cat.parent_id);
      }
    }

    // Group children under parents
    const parentGroups: Record<string, { planned: number; spent: number; children: any[] }> = {};

    for (const b of currentBudgets) {
      const cat = catMap.get(b.category_id || "");
      if (!cat) continue;

      if (cat.parent_id && parentCatIds.has(cat.parent_id)) {
        if (!parentGroups[cat.parent_id]) {
          parentGroups[cat.parent_id] = { planned: 0, spent: 0, children: [] };
        }
        const spent = spentMap[cat.id] || 0;
        parentGroups[cat.parent_id].planned += b.planned_amount;
        parentGroups[cat.parent_id].spent += spent;
        parentGroups[cat.parent_id].children.push({
          id: b.id,
          name: cat.name,
          icon: cat.icon || "📊",
          planned: b.planned_amount,
          spent: Math.round(spent),
          pct: b.planned_amount > 0 ? Math.round((spent / b.planned_amount) * 100) : 0,
        });
      }
    }

    const parents = Object.entries(parentGroups).map(([parentId, g]) => {
      const parentCat = catMap.get(parentId);
      const pct = g.planned > 0 ? Math.round((g.spent / g.planned) * 100) : 0;
      return {
        id: parentId,
        name: parentCat?.name || "Sem nome",
        icon: parentCat?.icon || "📊",
        planned: g.planned,
        spent: Math.round(g.spent),
        pct,
        overBudget: pct > 100,
        children: g.children.sort((a: any, b: any) => b.pct - a.pct),
      };
    }).sort((a, b) => b.pct - a.pct);

    // Leaf categories (no parent, and not a parent themselves)
    const leaves = currentBudgets
      .filter((b) => {
        const cat = catMap.get(b.category_id || "");
        if (!cat) return false;
        return !cat.parent_id && !parentCatIds.has(cat.id);
      })
      .map((b) => {
        const cat = catMap.get(b.category_id || "")!;
        const spent = spentMap[cat.id] || 0;
        const pct = b.planned_amount > 0 ? Math.round((spent / b.planned_amount) * 100) : 0;
        return {
          id: b.id,
          name: cat.name,
          icon: cat.icon || "📊",
          planned: b.planned_amount,
          spent: Math.round(spent),
          pct,
          overBudget: pct > 100,
        };
      })
      .sort((a, b) => b.pct - a.pct);

    return { parentItems: parents, leafItems: leaves };
  }, [currentBudgets, categories, expensesByMonthCat, currentMonthKey]);

  // Chart data: 6 months budget vs actual
  const chartData = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c]));

    return monthKeys.map((mk, idx) => {
      const monthBudgets = allBudgets.filter(
        (b) => b.month === mk.month && b.year === mk.year
      );

      // Sum planned (leaf only)
      const parentCatIdsInBudgets = new Set<string>();
      for (const b of monthBudgets) {
        const cat = catMap.get(b.category_id || "");
        if (cat?.parent_id) parentCatIdsInBudgets.add(cat.parent_id);
      }
      const planned = monthBudgets
        .filter((b) => !parentCatIdsInBudgets.has(b.category_id || ""))
        .reduce((s, b) => s + b.planned_amount, 0);

      // Sum actual
      const spentMap = expensesByMonthCat[mk.key] || {};
      const actual = Object.values(spentMap).reduce((s, v) => s + v, 0);

      return {
        label: mk.label,
        planned: Math.round(planned),
        actual: Math.round(actual),
        variance: 0, // will be calculated below
      };
    });
  }, [monthKeys, allBudgets, categories, expensesByMonthCat]);

  // Add variance %
  const chartDataWithVariance = useMemo(() => {
    return chartData.map((d, i) => {
      if (i === 0) return { ...d, variance: 0 };
      const prev = chartData[i - 1].actual;
      const variance = prev > 0 ? Math.round(((d.actual - prev) / prev) * 100) : 0;
      return { ...d, variance };
    });
  }, [chartData]);

  // Accumulated totals
  const accumulated = useMemo(() => {
    const totalPlanned = chartData.reduce((s, d) => s + d.planned, 0);
    const totalActual = chartData.reduce((s, d) => s + d.actual, 0);
    const pct = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
    const diff = totalActual - totalPlanned;
    return { totalPlanned, totalActual, pct, diff };
  }, [chartData]);

  const isLoading = budgetsLoading || txLoading;

  if (isLoading) {
    return <div className="h-[300px] flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const monthLabel = format(new Date(year, month - 1), "MMMM yyyy", { locale: ptBR });

  return (
    <div className="space-y-4">
      {/* Accumulated Card */}
      <BudgetAccumulatedCard accumulated={accumulated} />

      {/* Chart */}
      <BudgetChart data={chartDataWithVariance} />

      {/* Current Month Budget vs Actual */}
      <BudgetCurrentMonth
        monthLabel={monthLabel}
        parentItems={parentItems}
        leafItems={leafItems}
      />

      {/* Projects Section */}
      <ProjectsSection projects={activeProjects} />
    </div>
  );
}

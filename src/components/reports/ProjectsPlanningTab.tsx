import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDate } from "@/contexts/DateContext";
import { useBudgets } from "@/hooks/useBudgets";
import { useTransactions } from "@/hooks/useTransactions";
import { useProjects } from "@/hooks/useProjects";
import { useCategories } from "@/hooks/useCategories";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { filterPureExpenses, getCompetenceDate } from "@/lib/reportUtils";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Target, FolderKanban } from "lucide-react";

export function ProjectsPlanningTab() {
  const { month, year } = useDate();
  const { budgets, isLoading: budgetsLoading } = useBudgets(month, year);
  const { categories } = useCategories();
  const { transactions, isLoading: txLoading } = useTransactions(undefined, undefined, {
    showAll: true,
    loadedCount: 10000,
  });
  const { activeProjects } = useProjects();

  const currentMonthKey = `${year}-${String(month).padStart(2, "0")}`;

  // Radar: Budget vs Actual
  const radarData = useMemo(() => {
    if (!budgets.length || !transactions.length) return [];

    const pureExpenses = filterPureExpenses(transactions).filter(
      (t) => !t.is_refund && getCompetenceDate(t).substring(0, 7) === currentMonthKey
    );

    // Sum expenses by category
    const spentByCat: Record<string, number> = {};
    for (const t of pureExpenses) {
      const catId = t.category_id || "uncategorized";
      spentByCat[catId] = (spentByCat[catId] || 0) + Number(t.amount);
    }

    // Also aggregate subcategory spending to parent if budget is on parent
    const spentByParent: Record<string, number> = {};
    for (const t of pureExpenses) {
      const cat = categories.find((c) => c.id === t.category_id);
      const parentId = cat?.parent_id || t.category_id || "uncategorized";
      spentByParent[parentId] = (spentByParent[parentId] || 0) + Number(t.amount);
    }

    return budgets
      .filter((b) => b.planned_amount > 0 && b.categories)
      .map((b) => {
        const catId = b.category_id || "";
        const spent = spentByCat[catId] || spentByParent[catId] || 0;
        const name = b.categories?.name || "Sem nome";
        return {
          category: name.length > 10 ? name.substring(0, 10) + "…" : name,
          planejado: Math.round(b.planned_amount),
          realizado: Math.round(spent),
        };
      })
      .slice(0, 8); // Limit radar points
  }, [budgets, transactions, categories, currentMonthKey]);

  // Projects: stacked bars showing project spending as % of total monthly expense
  const projectData = useMemo(() => {
    if (!activeProjects.length || !transactions.length) return [];

    const pureExpenses = filterPureExpenses(transactions).filter(
      (t) => !t.is_refund && getCompetenceDate(t).substring(0, 7) === currentMonthKey
    );

    const totalMonthSpend = pureExpenses.reduce((s, t) => s + Number(t.amount), 0);
    if (totalMonthSpend === 0) return [];

    return activeProjects
      .filter((p) => p.spent_amount > 0)
      .map((p) => ({
        name: p.name,
        icon: p.icon || "📦",
        valor: p.spent_amount,
        percentual: Math.round((p.spent_amount / totalMonthSpend) * 100),
        color: p.color || "#3B82F6",
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [activeProjects, transactions, currentMonthKey]);

  const isLoading = budgetsLoading || txLoading;

  if (isLoading) {
    return <div className="h-[300px] flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const RadarTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-2 shadow-lg text-sm">
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Radar Chart: Budget vs Actual */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Planejado vs Realizado ({format(new Date(year, month - 1), "MMMM yyyy", { locale: ptBR })})
          </h3>
          {radarData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum orçamento definido para este mês
            </p>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="70%">
                  <PolarGrid className="stroke-border/50" />
                  <PolarAngleAxis dataKey="category" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <PolarRadiusAxis tick={{ fontSize: 9 }} className="fill-muted-foreground" />
                  <Radar name="Planejado" dataKey="planejado" stroke="hsl(var(--chart-4))" fill="hsl(var(--chart-4))" fillOpacity={0.2} />
                  <Radar name="Realizado" dataKey="realizado" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.2} />
                  <Tooltip content={<RadarTooltip />} />
                  <Legend verticalAlign="bottom" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project Spending */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-primary" />
            Impacto dos Projetos no Mês
          </h3>
          {projectData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum projeto com gastos neste mês
            </p>
          ) : (
            <>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      width={80}
                    />
                    <Tooltip
                      formatter={(value: number, name: string, props: any) => [
                        `${formatCurrency(props.payload.valor)} (${value}%)`,
                        "Participação",
                      ]}
                    />
                    <Bar dataKey="percentual" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-3">
                {projectData.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-sm">
                    <span>{p.icon}</span>
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="font-medium">{formatCurrency(p.valor)}</span>
                    <span className="text-xs text-muted-foreground">({p.percentual}%)</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useDate } from "@/contexts/DateContext";
import { useBudgets } from "@/hooks/useBudgets";
import { useTransactions } from "@/hooks/useTransactions";
import { useProjects } from "@/hooks/useProjects";
import { useCategories } from "@/hooks/useCategories";
import { filterPureExpenses, getCompetenceDate } from "@/lib/reportUtils";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Target, FolderKanban, AlertCircle, CheckCircle2 } from "lucide-react";

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

  // Budget vs Actual data
  const budgetItems = useMemo(() => {
    if (!budgets.length || !transactions.length) return [];

    const pureExpenses = filterPureExpenses(transactions).filter(
      (t) => !t.is_refund && getCompetenceDate(t).substring(0, 7) === currentMonthKey
    );

    const spentByCat: Record<string, number> = {};
    const spentByParent: Record<string, number> = {};

    for (const t of pureExpenses) {
      const catId = t.category_id || "uncategorized";
      spentByCat[catId] = (spentByCat[catId] || 0) + Number(t.amount);

      const cat = categories.find((c) => c.id === t.category_id);
      const parentId = cat?.parent_id || t.category_id || "uncategorized";
      spentByParent[parentId] = (spentByParent[parentId] || 0) + Number(t.amount);
    }

    return budgets
      .filter((b) => b.planned_amount > 0 && b.categories)
      .map((b) => {
        const catId = b.category_id || "";
        const spent = spentByCat[catId] || spentByParent[catId] || 0;
        const planned = b.planned_amount;
        const pct = planned > 0 ? Math.round((spent / planned) * 100) : 0;
        const cat = categories.find((c) => c.id === catId);

        return {
          id: b.id,
          name: b.categories?.name || "Sem nome",
          icon: cat?.icon || "📊",
          planned,
          spent: Math.round(spent),
          pct,
          overBudget: pct > 100,
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [budgets, transactions, categories, currentMonthKey]);

  // Project data
  const projectItems = useMemo(() => {
    return activeProjects
      .map((p) => {
        const pct = p.target_amount > 0 ? Math.round((p.spent_amount / p.target_amount) * 100) : 0;
        return {
          id: p.id,
          name: p.name,
          icon: p.icon || "📦",
          color: p.color || "#3B82F6",
          description: p.description,
          spent: p.spent_amount,
          target: p.target_amount,
          pct,
          overBudget: pct > 100,
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [activeProjects]);

  const isLoading = budgetsLoading || txLoading;

  if (isLoading) {
    return <div className="h-[300px] flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const monthLabel = format(new Date(year, month - 1), "MMMM yyyy", { locale: ptBR });

  return (
    <div className="space-y-4">
      {/* Budget Section */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Orçamento vs Realizado — {monthLabel}
          </h3>

          {budgetItems.length === 0 ? (
            <div className="text-center py-8">
              <Target className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum orçamento definido para este mês.</p>
              <p className="text-xs text-muted-foreground mt-1">Crie orçamentos na aba Planejamento.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {budgetItems.map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span>{item.icon}</span>
                      <span className="font-medium truncate max-w-[140px]">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.overBudget ? (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      ) : item.pct >= 80 ? (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      <span className={`text-xs font-semibold ${item.overBudget ? "text-destructive" : item.pct >= 80 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {item.pct}%
                      </span>
                    </div>
                  </div>
                  <Progress
                    value={Math.min(item.pct, 100)}
                    className={`h-2 ${item.overBudget ? "[&>div]:bg-destructive" : item.pct >= 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatCurrency(item.spent)} gasto</span>
                    <span>{formatCurrency(item.planned)} planejado</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Projects Section */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-primary" />
            Projetos Ativos
          </h3>

          {projectItems.length === 0 ? (
            <div className="text-center py-8">
              <FolderKanban className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum projeto ativo no momento.</p>
              <p className="text-xs text-muted-foreground mt-1">Crie projetos para acompanhar gastos por objetivo.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {projectItems.map((project) => (
                <div key={project.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{project.icon}</span>
                      <div>
                        <p className="font-medium text-sm text-foreground">{project.name}</p>
                        {project.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{project.description}</p>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      project.overBudget
                        ? "bg-destructive/10 text-destructive"
                        : project.pct >= 80
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    }`}>
                      {project.pct}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(project.pct, 100)}
                    className={`h-2 ${project.overBudget ? "[&>div]:bg-destructive" : project.pct >= 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatCurrency(project.spent)} gasto</span>
                    <span>{formatCurrency(project.target)} meta</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

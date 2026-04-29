import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FolderKanban } from "lucide-react";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import type { Project } from "@/hooks/useProjects";

export function ProjectsSection({ projects }: { projects: Project[] }) {
  const formatCurrency = useFormatCurrency();
  const items = projects
    .map((p) => {
      const pct = p.target_amount > 0 ? Math.round((p.spent_amount / p.target_amount) * 100) : 0;
      return { ...p, pct, overBudget: pct > 100 };
    })
    .sort((a, b) => b.pct - a.pct);

  return (
    <Card>
      <CardContent className="pt-4">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-primary" />
          Projetos Ativos
        </h3>

        {items.length === 0 ? (
          <div className="text-center py-8">
            <FolderKanban className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum projeto ativo no momento.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((project) => (
              <div key={project.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{project.icon || "📦"}</span>
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
                  <span>{formatCurrency(project.spent_amount)} gasto</span>
                  <span>{formatCurrency(project.target_amount)} meta</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

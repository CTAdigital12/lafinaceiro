import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { Project } from "@/hooks/useProjects";

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const percentage = project.target_amount > 0
    ? (project.spent_amount / project.target_amount) * 100
    : 0;

  const progressColor = percentage >= 100
    ? "bg-destructive"
    : percentage >= 80
      ? "bg-chart-4"
      : "bg-income";

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{project.icon || "📦"}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{project.name}</h3>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(project.spent_amount)} / {formatCurrency(project.target_amount)}
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <div className="h-2 rounded-full overflow-hidden bg-secondary">
            <div
              className={`h-full transition-all ${progressColor}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <p className="text-xs text-right text-muted-foreground">
            {percentage.toFixed(0)}%
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  accumulated: {
    totalPlanned: number;
    totalActual: number;
    pct: number;
    diff: number;
  };
}

export function BudgetAccumulatedCard({ accumulated }: Props) {
  const { totalPlanned, totalActual, pct, diff } = accumulated;
  const overBudget = pct > 100;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Acumulado — 6 meses</h3>
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
            overBudget
              ? "bg-destructive/10 text-destructive"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          }`}>
            <Icon className="h-3 w-3" />
            {pct}%
          </div>
        </div>
        <Progress
          value={Math.min(pct, 100)}
          className={`h-3 mb-3 ${overBudget ? "[&>div]:bg-destructive" : "[&>div]:bg-emerald-500"}`}
        />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Orçado</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(totalPlanned)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Realizado</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(totalActual)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Diferença</p>
            <p className={`text-sm font-semibold ${diff > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
              {diff > 0 ? "+" : ""}{formatCurrency(diff)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

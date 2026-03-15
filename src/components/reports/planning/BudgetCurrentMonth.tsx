import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Target, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface BudgetItem {
  id: string;
  name: string;
  icon: string;
  planned: number;
  spent: number;
  pct: number;
  overBudget?: boolean;
  children?: BudgetItem[];
}

function StatusIcon({ pct, overBudget }: { pct: number; overBudget?: boolean }) {
  if (overBudget) return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  if (pct >= 80) return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
  return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
}

function progressColor(pct: number, overBudget?: boolean) {
  if (overBudget) return "[&>div]:bg-destructive";
  if (pct >= 80) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-emerald-500";
}

function pctColor(pct: number, overBudget?: boolean) {
  if (overBudget) return "text-destructive";
  if (pct >= 80) return "text-amber-500";
  return "text-emerald-600 dark:text-emerald-400";
}

function BudgetRow({ item, indent = false }: { item: BudgetItem; indent?: boolean }) {
  return (
    <div className={`space-y-1.5 ${indent ? "ml-6" : ""}`}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm">{item.icon}</span>
          <span className="font-medium truncate max-w-[140px]">{item.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon pct={item.pct} overBudget={item.overBudget} />
          <span className={`text-xs font-semibold ${pctColor(item.pct, item.overBudget)}`}>
            {item.pct}%
          </span>
        </div>
      </div>
      <Progress
        value={Math.min(item.pct, 100)}
        className={`h-2 ${progressColor(item.pct, item.overBudget)}`}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatCurrency(item.spent)} gasto</span>
        <span>{formatCurrency(item.planned)} planejado</span>
      </div>
    </div>
  );
}

function CollapsibleBudgetRow({ item }: { item: BudgetItem }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="space-y-1.5">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
              <span className="text-sm">{item.icon}</span>
              <span className="font-medium truncate max-w-[130px]">{item.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusIcon pct={item.pct} overBudget={item.overBudget} />
              <span className={`text-xs font-semibold ${pctColor(item.pct, item.overBudget)}`}>
                {item.pct}%
              </span>
            </div>
          </div>
        </CollapsibleTrigger>
        <Progress
          value={Math.min(item.pct, 100)}
          className={`h-2 ${progressColor(item.pct, item.overBudget)}`}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatCurrency(item.spent)} gasto</span>
          <span>{formatCurrency(item.planned)} planejado</span>
        </div>
      </div>
      <CollapsibleContent>
        <div className="space-y-3 mt-3 border-l-2 border-muted pl-2">
          {item.children?.map((child) => (
            <BudgetRow key={child.id} item={child} indent />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface Props {
  monthLabel: string;
  parentItems: BudgetItem[];
  leafItems: BudgetItem[];
}

export function BudgetCurrentMonth({ monthLabel, parentItems, leafItems }: Props) {
  const hasItems = parentItems.length > 0 || leafItems.length > 0;

  return (
    <Card>
      <CardContent className="pt-4">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Orçamento vs Realizado — {monthLabel}
        </h3>

        {!hasItems ? (
          <div className="text-center py-8">
            <Target className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum orçamento definido para este mês.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {parentItems.map((item) => (
              <CollapsibleBudgetRow key={item.id} item={item} />
            ))}
            {leafItems.map((item) => (
              <BudgetRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

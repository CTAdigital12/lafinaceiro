import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Target, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

import type { BudgetPeriodItem as BudgetItem } from "@/lib/budgetPeriodReport";

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

/** Cabeçalho comum: nome à esquerda; % e status à direita, ou "sem meta". */
function RowHeader({ item }: { item: BudgetItem }) {
  return (
    <div className="flex items-center gap-2">
      {item.unbudgeted ? (
        <span className="text-xs text-muted-foreground">sem meta</span>
      ) : (
        <>
          <StatusIcon pct={item.pct} overBudget={item.overBudget} />
          <span className={`text-xs font-semibold ${pctColor(item.pct, item.overBudget)}`}>
            {item.pct}%
          </span>
        </>
      )}
    </div>
  );
}

/** Barra e valores. Linha sem meta não tem barra: não há o que consumir. */
function RowValues({ item }: { item: BudgetItem }) {
  const formatCurrency = useFormatCurrency();
  return (
    <>
      {!item.unbudgeted && (
        <Progress
          value={Math.min(item.pct, 100)}
          className={`h-2 ${progressColor(item.pct, item.overBudget)}`}
        />
      )}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatCurrency(item.spent)} gasto</span>
        <span>{item.unbudgeted ? "fora do orçamento" : `${formatCurrency(item.planned)} planejado`}</span>
      </div>
    </>
  );
}

function BudgetRow({ item, indent = false }: { item: BudgetItem; indent?: boolean }) {
  return (
    <div className={`space-y-1.5 ${indent ? "ml-6" : ""}`}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm">{item.icon}</span>
          <span className="font-medium truncate max-w-[140px]">{item.name}</span>
        </div>
        <RowHeader item={item} />
      </div>
      <RowValues item={item} />
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
            <RowHeader item={item} />
          </div>
        </CollapsibleTrigger>
        <RowValues item={item} />
      </div>
      <CollapsibleContent>
        <div className="space-y-3 mt-3 border-l-2 border-muted pl-2">
          {item.children.map((child) => (
            <BudgetRow key={child.id} item={child} indent />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface Props {
  /** Ex.: "set/26 a nov/26 (acumulado)". */
  periodLabel: string;
  items: BudgetItem[];
}

/**
 * Quadro "Orçamento vs Realizado" do período: metas e gastos somados mês a mês
 * (ver `buildBudgetPeriodReport`). Toda despesa do período está em alguma
 * linha — as sem meta aparecem marcadas —, então o total fecha com o card.
 */
export function BudgetCurrentMonth({ periodLabel, items }: Props) {
  return (
    <Card>
      <CardContent className="pt-4">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Orçamento vs Realizado — {periodLabel}
        </h3>

        {items.length === 0 ? (
          <div className="text-center py-8">
            <Target className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum orçamento nem gasto neste período.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) =>
              item.children.length > 0 ? (
                <CollapsibleBudgetRow key={item.id} item={item} />
              ) : (
                <BudgetRow key={item.id} item={item} />
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

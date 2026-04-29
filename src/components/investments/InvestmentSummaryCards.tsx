import { TrendingUp, Wallet, PiggyBank, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Currency } from "@/components/ui/currency";

interface InvestmentSummaryCardsProps {
  totalPatrimony: number;
  totalApplied: number;
  totalResult: number;
  resultPercentage: number;
}

export function InvestmentSummaryCards({
  totalPatrimony,
  totalApplied,
  totalResult,
  resultPercentage,
}: InvestmentSummaryCardsProps) {
  const isProfit = totalResult >= 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Patrimônio Total</p>
              <Currency value={totalPatrimony} className="text-2xl font-bold text-foreground block" />
              <p className="text-xs text-muted-foreground mt-1">Valor atual da carteira</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Valor Aplicado</p>
              <Currency value={totalApplied} className="text-2xl font-bold text-foreground block" />
              <p className="text-xs text-muted-foreground mt-1">Custo de aquisição</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Wallet className="h-6 w-6 text-blue-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Resultado Aberto</p>
              <Currency value={totalResult} className={cn("text-2xl font-bold block", isProfit ? "text-emerald-500" : "text-red-500")} />
              <p className={cn("text-xs mt-1", isProfit ? "text-emerald-500" : "text-red-500")}>
                {isProfit ? "+" : ""}{resultPercentage.toFixed(2)}%
              </p>
            </div>
            <div className={cn(
              "h-12 w-12 rounded-full flex items-center justify-center",
              isProfit ? "bg-emerald-500/10" : "bg-red-500/10"
            )}>
              <PiggyBank className={cn("h-6 w-6", isProfit ? "text-emerald-500" : "text-red-500")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Rentabilidade</p>
              <p className={cn("text-2xl font-bold", isProfit ? "text-emerald-500" : "text-red-500")}>
                {isProfit ? "+" : ""}{resultPercentage.toFixed(2)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">PM vs Preço Atual</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-violet-500/10 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-violet-500" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  variant: "balance" | "income" | "expense" | "card";
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const variantStyles = {
  balance: {
    borderColor: "border-l-balance",
    iconBg: "bg-balance/10",
    iconColor: "text-balance",
    valueColor: "text-balance",
  },
  income: {
    borderColor: "border-l-income",
    iconBg: "bg-income/10",
    iconColor: "text-income",
    valueColor: "text-income",
  },
  expense: {
    borderColor: "border-l-expense",
    iconBg: "bg-expense/10",
    iconColor: "text-expense",
    valueColor: "text-expense",
  },
  card: {
    borderColor: "border-l-primary",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    valueColor: "text-primary",
  },
};

export function SummaryCard({ title, value, subtitle, icon: Icon, variant, trend }: SummaryCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        "relative bg-card rounded-xl p-6 border border-border border-l-4 shadow-sm transition-all duration-200 hover:shadow-md animate-fade-in",
        styles.borderColor
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn("text-2xl font-bold tracking-tight text-foreground")}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 text-xs">
              <span className={trend.isPositive ? "text-income" : "text-expense"}>
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              </span>
              <span className="text-muted-foreground">vs mês anterior</span>
            </div>
          )}
        </div>
        <div className={cn("rounded-lg p-2.5", styles.iconBg)}>
          <Icon className={cn("h-5 w-5", styles.iconColor)} />
        </div>
      </div>
    </div>
  );
}

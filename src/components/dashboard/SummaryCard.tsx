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
    gradient: "gradient-balance",
    iconBg: "bg-balance-foreground/20",
    textColor: "text-balance-foreground",
  },
  income: {
    gradient: "gradient-income",
    iconBg: "bg-income-foreground/20",
    textColor: "text-income-foreground",
  },
  expense: {
    gradient: "gradient-expense",
    iconBg: "bg-expense-foreground/20",
    textColor: "text-expense-foreground",
  },
  card: {
    gradient: "bg-gradient-to-br from-slate-800 to-slate-900",
    iconBg: "bg-white/20",
    textColor: "text-white",
  },
};

export function SummaryCard({ title, value, subtitle, icon: Icon, variant, trend }: SummaryCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl p-5 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5 animate-fade-in",
        styles.gradient
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className={cn("text-sm font-medium opacity-90", styles.textColor)}>{title}</p>
          <p className={cn("text-2xl font-bold tracking-tight", styles.textColor)}>{value}</p>
          {subtitle && (
            <p className={cn("text-xs opacity-75", styles.textColor)}>{subtitle}</p>
          )}
          {trend && (
            <div className={cn("flex items-center gap-1 text-xs", styles.textColor)}>
              <span className={trend.isPositive ? "text-green-200" : "text-red-200"}>
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              </span>
              <span className="opacity-75">vs mês anterior</span>
            </div>
          )}
        </div>
        <div className={cn("rounded-lg p-2.5", styles.iconBg)}>
          <Icon className={cn("h-5 w-5", styles.textColor)} />
        </div>
      </div>

      {/* Decorative element */}
      <div className="absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-white/5" />
    </div>
  );
}

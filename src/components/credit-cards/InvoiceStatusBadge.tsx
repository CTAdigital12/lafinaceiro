import { Lock, Unlock, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/hooks/useInvoiceCycles";

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

export function InvoiceStatusBadge({ status, className }: InvoiceStatusBadgeProps) {
  const config = {
    open: {
      label: "Aberta",
      icon: Unlock,
      className: "bg-income/10 text-income border-income/20",
    },
    closed: {
      label: "Fechada",
      icon: Lock,
      className: "bg-muted text-muted-foreground border-border",
    },
    paid: {
      label: "Paga",
      icon: CheckCircle,
      className: "bg-primary/10 text-primary border-primary/20",
    },
  };

  const { label, icon: Icon, className: badgeClassName } = config[status];

  return (
    <Badge variant="secondary" className={cn(badgeClassName, "text-xs gap-1", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

import { useState, useEffect } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Link2, Pencil, Trash2, X, CheckCircle, Ban, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LinkTransactionsModal } from "./LinkTransactionsModal";
import type { Project } from "@/hooks/useProjects";

interface LinkedTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: string;
  is_refund: boolean;
  categories?: { name: string; icon: string; color: string } | null;
}

interface ProjectDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: "active" | "completed" | "cancelled") => void;
  onLinkTransactions: (transactionIds: string[]) => Promise<void>;
  onUnlinkTransaction: (transactionId: string) => Promise<void>;
  isLinking: boolean;
}

export function ProjectDetailSheet({
  open,
  onOpenChange,
  project,
  onEdit,
  onDelete,
  onStatusChange,
  onLinkTransactions,
  onUnlinkTransaction,
  isLinking,
}: ProjectDetailSheetProps) {
  const [transactions, setTransactions] = useState<LinkedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  useEffect(() => {
    if (open && project) {
      loadLinkedTransactions();
    }
  }, [open, project?.id, project?.spent_amount]);

  const loadLinkedTransactions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("id, description, amount, date, type, is_refund, categories (name, icon, color)")
      .eq("project_id", project.id)
      .order("date", { ascending: false });

    if (!error && data) {
      setTransactions(data as LinkedTransaction[]);
    }
    setLoading(false);
  };

  const remaining = project.target_amount - project.spent_amount;
  const percentage = project.target_amount > 0
    ? (project.spent_amount / project.target_amount) * 100
    : 0;

  const progressColor = percentage >= 100
    ? "bg-destructive"
    : percentage >= 80
      ? "bg-chart-4"
      : "bg-income";

  const statusConfig: Record<string, { label: string; className: string }> = {
    active: { label: "Ativo", className: "bg-income/10 text-income" },
    completed: { label: "Concluído", className: "bg-primary/10 text-primary" },
    cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
  };

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`${project.icon || "📦"} ${project.name}`} className="sm:max-w-[500px]">
        <div className="space-y-4">
          {/* Status badge */}
          <div className="flex items-center justify-between">
            <Badge className={statusConfig[project.status]?.className}>
              {statusConfig[project.status]?.label}
            </Badge>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
                <Pencil className="h-4 w-4" />
              </Button>
              {project.status === "active" && (
                <Button variant="ghost" size="icon" onClick={() => onStatusChange("completed")} className="h-8 w-8 text-income">
                  <CheckCircle className="h-4 w-4" />
                </Button>
              )}
              {project.status === "active" && (
                <Button variant="ghost" size="icon" onClick={() => onStatusChange("cancelled")} className="h-8 w-8 text-muted-foreground">
                  <Ban className="h-4 w-4" />
                </Button>
              )}
              {project.status !== "active" && (
                <Button variant="ghost" size="sm" onClick={() => onStatusChange("active")} className="h-8 text-xs">
                  Reativar
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Remaining amount */}
          <div className="text-center py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Restante</p>
            <p className={`text-3xl font-bold ${remaining >= 0 ? "text-income" : "text-destructive"}`}>
              {formatCurrency(remaining)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCurrency(project.spent_amount)} de {formatCurrency(project.target_amount)}
            </p>
          </div>

          {/* Progress */}
          <div className="space-y-1">
            <div className="h-3 rounded-full overflow-hidden bg-secondary">
              <div
                className={`h-full transition-all ${progressColor}`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-right text-muted-foreground">{percentage.toFixed(0)}%</p>
          </div>

          {project.description && (
            <p className="text-sm text-muted-foreground">{project.description}</p>
          )}

          {/* Link button */}
          {project.status === "active" && (
            <Button variant="outline" className="w-full" onClick={() => setLinkModalOpen(true)}>
              <Link2 className="mr-2 h-4 w-4" />
              Vincular Despesas Existentes
            </Button>
          )}

          {/* Linked transactions */}
          <div>
            <h4 className="text-sm font-medium mb-2">
              Transações Vinculadas ({transactions.length})
            </h4>
            <ScrollArea className="h-[200px]" data-vaul-no-drag>
              {loading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma transação vinculada
                </p>
              ) : (
                <div className="space-y-1" data-vaul-no-drag>
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          {tx.categories?.icon} {tx.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(tx.date + "T12:00:00"), "dd/MM/yyyy")}
                        </p>
                      </div>
                      <span className={`text-sm font-medium ${tx.is_refund ? "text-income" : "text-expense"}`}>
                        {tx.is_refund ? "+" : "-"}{formatCurrency(tx.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onUnlinkTransaction(tx.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </ResponsiveDialog>

      <LinkTransactionsModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        projectId={project.id}
        onLink={onLinkTransactions}
        isPending={isLinking}
      />
    </>
  );
}

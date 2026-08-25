import { useEffect, useMemo, useState } from "react";
import { Loader2, ListChecks, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { useSettleCandidates, useSettleWithPayment } from "@/hooks/useSettleWithPayment";
import { settleRemaining } from "@/lib/settleWithPayment";
import { formatYmd } from "@/lib/dateUtils";
import { round2 } from "@/lib/splitTransaction";
import { cn } from "@/lib/utils";

interface SettleWithPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Débito real já lançado, que pagou os previstos. */
  payment: {
    id: string;
    description: string;
    amount: number;
    date: string;
    type: string;
  } | null;
}

/**
 * "Este débito pagou estes previstos": marca N lançamentos previstos como
 * pagos por UM lançamento real. Os previstos viram as partes de uma divisão e
 * o lançamento do pagamento é apagado — quem passa a representar a linha do
 * extrato é o grupo, com a mesma data e a mesma soma.
 *
 * É o caminho para parcelas, onde apagar o previsto não é opção: excluir uma
 * parcela encolheria o grupo do parcelamento.
 */
export function SettleWithPaymentModal({
  open,
  onOpenChange,
  payment,
}: SettleWithPaymentModalProps) {
  const fmt = useFormatCurrency();
  const { candidates, isLoading } = useSettleCandidates(payment, open);
  const { settleWithPayment } = useSettleWithPayment();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) setSelectedIds(new Set());
  }, [open, payment?.id]);

  const selected = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.id)),
    [candidates, selectedIds],
  );

  const remaining = payment ? settleRemaining(Number(payment.amount), selected) : 0;
  const allocated = payment ? round2(Number(payment.amount) - remaining) : 0;
  const canSubmit = selected.length > 0 && remaining === 0 && !settleWithPayment.isPending;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payment || !canSubmit) return;
    await settleWithPayment.mutateAsync({
      paymentId: payment.id,
      targetIds: [...selectedIds],
    });
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quitar previstos com este pagamento"
      className="sm:max-w-xl"
    >
      {!payment ? null : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{payment.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatYmd(payment.date, "dd/MM/yyyy")} • valor do pagamento
                </p>
              </div>
              <span className="shrink-0 font-bold">{fmt(Number(payment.amount))}</span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Marque os lançamentos previstos que este débito pagou. Eles viram as partes deste
            pagamento — conservando categoria, parcelamento e recorrência — e passam a somar uma
            linha só, igual à do extrato. A soma tem que fechar com o valor do pagamento.
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Nenhum lançamento previsto nesta conta em até 60 dias desta data.
            </p>
          ) : (
            <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
              {candidates.map((candidate) => {
                const checked = selectedIds.has(candidate.id);
                return (
                  <label
                    key={candidate.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                      checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(candidate.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{candidate.description}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatYmd(candidate.date, "dd/MM/yyyy")}</span>
                        {candidate.categories?.name && <span>• {candidate.categories.name}</span>}
                        {candidate.total_installments && candidate.total_installments > 1 && (
                          <Badge variant="secondary" className="text-[10px]">
                            {candidate.installment_number}/{candidate.total_installments}
                          </Badge>
                        )}
                        {candidate.is_provisional && (
                          <Badge variant="outline" className="text-[10px]">
                            Provisória
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">
                      {fmt(Number(candidate.amount))}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <Separator />

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Selecionado</span>
              <span className="font-medium">{fmt(allocated)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {remaining < 0 ? "Excede em" : "Falta"}
              </span>
              <span
                className={cn("font-medium", remaining === 0 ? "text-income" : "text-expense")}
              >
                {fmt(Math.abs(remaining))}
              </span>
            </div>
          </div>

          {selected.length > 0 && remaining === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                O lançamento <strong>{payment.description}</strong> será excluído — quem passa a
                representar essa linha do extrato {selected.length > 1 ? "são" : "é"} o
                {selected.length > 1 ? "s" : ""} previsto{selected.length > 1 ? "s" : ""}{" "}
                selecionado{selected.length > 1 ? "s" : ""}, agora com a data{" "}
                {formatYmd(payment.date, "dd/MM/yyyy")}.
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="gap-2" disabled={!canSubmit}>
              {settleWithPayment.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ListChecks className="h-4 w-4" />
              )}
              Quitar
            </Button>
          </div>
        </form>
      )}
    </ResponsiveDialog>
  );
}

import { CreditCard, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface ReimbursementOriginDialogProps {
  /** Despesas de CARTÃO sendo quitadas; `null` fecha o diálogo. */
  targets: { description: string; amount: number }[] | null;
  onClose: () => void;
  /** Quem devia pagou o cartão direto — espelho na fatura (`mark_reimbursed`). */
  onInvoice: () => void;
  /** O dinheiro caiu numa conta — receita de reembolso (`settle_reimbursements`). */
  onAccount: () => void;
}

/**
 * Origem do reembolso de uma despesa de CARTÃO. Os dois caminhos mexem em
 * lugares diferentes: o crédito na fatura abate a própria fatura; o PIX entra
 * como receita na conta e não toca no que o banco vai cobrar.
 *
 * Mora aqui, e não dentro de uma página, porque a mesma pergunta vale para
 * Reembolsos Diversos e Despesas Corporativas — e enquanto vivia só na
 * primeira, a segunda assumia sempre o espelho: um PIX da empresa virava
 * abatimento na fatura, que ficava menor do que o banco cobrou.
 */
export function ReimbursementOriginDialog({
  targets,
  onClose,
  onInvoice,
  onAccount,
}: ReimbursementOriginDialogProps) {
  const fmt = useFormatCurrency();
  const count = targets?.length ?? 0;
  const total = (targets ?? []).reduce((s, t) => s + Number(t.amount), 0);

  return (
    <AlertDialog open={!!targets} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Como o reembolso chegou?</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1 ? targets?.[0].description : `${count} despesas selecionadas`}
            {" — "}
            <strong>{fmt(total)}</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-2 py-2">
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-3 text-left"
            onClick={onInvoice}
          >
            <CreditCard className="h-5 w-5 shrink-0 text-primary" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Crédito na fatura do cartão</span>
              <span className="text-xs text-muted-foreground whitespace-normal">
                Quem devia pagou o cartão direto. Abate o valor da fatura.
              </span>
            </span>
          </Button>

          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-3 text-left"
            onClick={onAccount}
          >
            <Wallet className="h-5 w-5 shrink-0 text-income" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">PIX / transferência numa conta</span>
              <span className="text-xs text-muted-foreground whitespace-normal">
                O dinheiro caiu na sua conta. A fatura continua cheia — você já a pagou.
              </span>
            </span>
          </Button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, Link2, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAccounts } from "@/hooks/useAccounts";
import { useReimbursementIncomeCandidates } from "@/hooks/useReimbursementIncomeCandidates";
import { useReimbursementPayment } from "@/hooks/useReimbursementPayment";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { formatYmd } from "@/lib/dateUtils";

interface SettleReimbursementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Despesa reembolsável a quitar. */
  transaction: {
    id: string;
    description: string;
    amount: number;
    date: string;
    /** Vencimento da fatura, quando a despesa é de cartão. */
    due_date?: string | null;
  } | null;
}

type Mode = "link" | "create";

/**
 * Modal para registrar o recebimento de um reembolso FORA da fatura (PIX /
 * transferência). Dois caminhos:
 *  - "link":   vincular uma receita já lançada (o PIX que entrou na conta)
 *  - "create": criar a receita do reembolso numa conta escolhida
 * Em ambos a receita é neutralizada dos KPIs (is_reimbursement) pelo backend.
 */
export function SettleReimbursementModal({
  open,
  onOpenChange,
  transaction,
}: SettleReimbursementModalProps) {
  const fmt = useFormatCurrency();
  const { accounts } = useAccounts();
  const { settleExternal } = useReimbursementPayment();
  // Numa despesa de cartão o reembolso chega perto do VENCIMENTO da fatura,
  // não da data da compra: uma compra de 17/06 numa fatura que vence em 15/08
  // é paga de volta em agosto. Ancorar na data da compra jogava o PIX para
  // fora da janela de candidatas. Conta comum não tem due_date -> usa `date`.
  const refDate = transaction?.due_date ?? transaction?.date;
  const { candidates, isLoading: loadingCandidates } =
    useReimbursementIncomeCandidates(refDate, open);

  const [mode, setMode] = useState<Mode>("link");
  const [incomeId, setIncomeId] = useState("");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (open) {
      setMode("link");
      setIncomeId("");
      setAccountId("");
    }
  }, [open, transaction?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;

    if (mode === "link") {
      if (!incomeId) return;
      await settleExternal.mutateAsync({
        transactionId: transaction.id,
        incomeId,
      });
    } else {
      if (!accountId) return;
      await settleExternal.mutateAsync({
        transactionId: transaction.id,
        accountId,
        date: format(new Date(), "yyyy-MM-dd"),
      });
    }
    onOpenChange(false);
  };

  const isPending = settleExternal.isPending;
  const canSubmit =
    !isPending && (mode === "link" ? !!incomeId : !!accountId);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar reembolso recebido"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {transaction && (
          <div className="rounded-lg bg-muted/50 border border-border p-3">
            <p className="text-sm text-muted-foreground">Despesa</p>
            <p className="font-medium">{transaction.description}</p>
            <p className="text-lg font-semibold">{fmt(Number(transaction.amount))}</p>
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("link")}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium transition-all flex items-center justify-center gap-1.5",
              mode === "link"
                ? "bg-background shadow"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Link2 className="h-4 w-4" />
            Vincular PIX
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium transition-all flex items-center justify-center gap-1.5",
              mode === "create"
                ? "bg-background shadow"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <PlusCircle className="h-4 w-4" />
            Criar receita
          </button>
        </div>

        {mode === "link" ? (
          <div className="space-y-2">
            <Label>Receita recebida (PIX / transferência)</Label>
            {loadingCandidates ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando receitas...
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nenhuma receita encontrada por perto. Crie a receita na outra aba.
              </p>
            ) : (
              <Select value={incomeId} onValueChange={setIncomeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a receita" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {formatYmd(c.date, "dd/MM")} • {c.description} •{" "}
                      {fmt(Number(c.amount))}
                      {c.accounts?.name ? ` • ${c.accounts.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              A receita escolhida deixa de contar como entrada nos relatórios (vira
              reembolso), mas continua no saldo da conta.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Conta que recebeu o reembolso</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.icon} {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cria uma receita de reembolso nesta conta com o valor da despesa. Ela
              soma no saldo, mas não infla suas receitas.
            </p>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Registrando...
            </>
          ) : (
            "Confirmar reembolso"
          )}
        </Button>
      </form>
    </ResponsiveDialog>
  );
}

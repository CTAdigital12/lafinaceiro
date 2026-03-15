import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock, AlertTriangle } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useInvoiceCycles } from "@/hooks/useInvoiceCycles";

interface CloseInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditCardId: string;
  creditCardName: string;
  month: number;
  year: number;
  totalAmount: number;
  dueDate?: string;
  closingDate?: string;
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export function CloseInvoiceModal({
  open,
  onOpenChange,
  creditCardId,
  creditCardName,
  month,
  year,
  totalAmount,
  dueDate,
  closingDate,
}: CloseInvoiceModalProps) {
  const { closeInvoice } = useInvoiceCycles();
  const [isClosing, setIsClosing] = useState(false);

  const periodDate = new Date(year, month - 1);
  const periodLabel = format(periodDate, "MMMM 'de' yyyy", { locale: ptBR });

  const handleClose = async () => {
    setIsClosing(true);
    try {
      await closeInvoice.mutateAsync({
        creditCardId,
        month,
        year,
        closedAmount: totalAmount,
        dueDate,
        closingDate,
      });
      onOpenChange(false);
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Fechar Fatura
        </span>
      }
      description={`Confirme o fechamento da fatura de ${creditCardName}`}
      className="sm:max-w-md"
    >
        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Período:</span>
              <span className="font-medium capitalize">{periodLabel}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor Total:</span>
              <span className="font-bold text-lg">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          {/* Warning */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Após fechar a fatura, as transações deste período ficarão protegidas contra
              edições acidentais. Você poderá reabrir a qualquer momento se precisar
              fazer correções.
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isClosing}>
            Cancelar
          </Button>
          <Button onClick={handleClose} disabled={isClosing}>
            {isClosing ? "Fechando..." : "Fechar Fatura"}
          </Button>
        </div>
    </ResponsiveDialog>
  );
}

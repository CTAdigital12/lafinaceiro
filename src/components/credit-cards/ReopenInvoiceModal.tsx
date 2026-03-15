import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Unlock, AlertTriangle } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useInvoiceCycles } from "@/hooks/useInvoiceCycles";

interface ReopenInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditCardId: string;
  creditCardName: string;
  month: number;
  year: number;
}

export function ReopenInvoiceModal({
  open,
  onOpenChange,
  creditCardId,
  creditCardName,
  month,
  year,
}: ReopenInvoiceModalProps) {
  const { reopenInvoice } = useInvoiceCycles();
  const [isReopening, setIsReopening] = useState(false);

  const periodDate = new Date(year, month - 1);
  const periodLabel = format(periodDate, "MMMM 'de' yyyy", { locale: ptBR });

  const handleReopen = async () => {
    setIsReopening(true);
    try {
      await reopenInvoice.mutateAsync({
        creditCardId,
        month,
        year,
      });
      onOpenChange(false);
    } finally {
      setIsReopening(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2 text-chart-4">
          <Unlock className="h-5 w-5" />
          Reabrir Fatura
        </span>
      }
      description={`Desbloquear a fatura de ${creditCardName} para edição`}
      className="sm:max-w-md"
    >
        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Período:</span>
              <span className="font-medium capitalize">{periodLabel}</span>
            </div>
          </div>

          {/* Warning */}
          <Alert className="border-chart-4/50 bg-chart-4/10">
            <AlertTriangle className="h-4 w-4 text-chart-4" />
            <AlertDescription className="text-sm">
              Ao reabrir a fatura, você poderá editar, adicionar ou excluir transações
              deste período. Lembre-se de fechar novamente após fazer as correções
              necessárias.
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isReopening}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            className="border-chart-4 text-chart-4 hover:bg-chart-4/10"
            onClick={handleReopen}
            disabled={isReopening}
          >
            {isReopening ? "Reabrindo..." : "Reabrir Fatura"}
          </Button>
        </div>
    </ResponsiveDialog>
  );
}

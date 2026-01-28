import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ClosedInvoiceBannerProps {
  onReopen: () => void;
  isReopening?: boolean;
}

export function ClosedInvoiceBanner({ onReopen, isReopening }: ClosedInvoiceBannerProps) {
  return (
    <Alert className="border-muted bg-muted/30">
      <Lock className="h-4 w-4 text-muted-foreground" />
      <AlertTitle className="text-muted-foreground">Fatura Fechada</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <span className="text-sm text-muted-foreground">
          Esta fatura foi conferida e fechada. Reabra para editar lançamentos.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="w-fit border-chart-4 text-chart-4 hover:bg-chart-4/10"
          onClick={onReopen}
          disabled={isReopening}
        >
          <Unlock className="h-3 w-3 mr-1" />
          {isReopening ? "Reabrindo..." : "Reabrir para Editar"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

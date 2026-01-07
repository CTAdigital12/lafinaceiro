import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InvestmentAsset, ASSET_TYPE_LABELS } from "@/hooks/useInvestments";

interface UpdatePricesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: InvestmentAsset[];
  onSubmit: (updates: { id: string; current_price: number }[]) => void;
}

export function UpdatePricesModal({
  open,
  onOpenChange,
  assets,
  onSubmit,
}: UpdatePricesModalProps) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const initialPrices: Record<string, number> = {};
      assets.forEach((asset) => {
        initialPrices[asset.id] = asset.current_price;
      });
      setPrices(initialPrices);
    }
  }, [open, assets]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const updates = Object.entries(prices).map(([id, current_price]) => ({
        id,
        current_price,
      }));
      await onSubmit(updates);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  // Group assets by type
  const assetsByType = assets.reduce((acc, asset) => {
    if (!acc[asset.asset_type]) {
      acc[asset.asset_type] = [];
    }
    acc[asset.asset_type].push(asset);
    return acc;
  }, {} as Record<string, InvestmentAsset[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atualizar Cotações</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {Object.entries(assetsByType).map(([type, typeAssets]) => (
            <div key={type}>
              <h3 className="font-medium text-sm text-muted-foreground mb-3">
                {ASSET_TYPE_LABELS[type]}
              </h3>
              <div className="space-y-3">
                {typeAssets.map((asset) => (
                  <div key={asset.id} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{asset.ticker}</p>
                      <p className="text-xs text-muted-foreground">
                        PM: {formatCurrency(asset.average_price)}
                      </p>
                    </div>
                    <div className="w-32">
                      <Label className="sr-only">Preço atual</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={prices[asset.id] || 0}
                        onChange={(e) =>
                          setPrices((prev) => ({
                            ...prev,
                            [asset.id]: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {assets.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              Nenhum ativo cadastrado.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || assets.length === 0}>
            {isSubmitting ? "Salvando..." : "Salvar Cotações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

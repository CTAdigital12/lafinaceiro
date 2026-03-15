import { useState, useEffect } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InvestmentAsset, ASSET_TYPE_LABELS, usesTotalBalancePricing } from "@/hooks/useInvestments";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface UpdatePricesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: InvestmentAsset[];
  onSubmit: (updates: { id: string; current_price?: number; current_balance?: number }[]) => void;
}

export function UpdatePricesModal({
  open,
  onOpenChange,
  assets,
  onSubmit,
}: UpdatePricesModalProps) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const initialPrices: Record<string, number> = {};
      const initialBalances: Record<string, number> = {};
      assets.forEach((asset) => {
        if (usesTotalBalancePricing(asset.asset_type)) {
          initialBalances[asset.id] = asset.current_balance || 0;
        } else {
          initialPrices[asset.id] = asset.current_price;
        }
      });
      setPrices(initialPrices);
      setBalances(initialBalances);
    }
  }, [open, assets]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const updates: { id: string; current_price?: number; current_balance?: number }[] = [];
      
      // Add unit_price updates
      Object.entries(prices).forEach(([id, current_price]) => {
        updates.push({ id, current_price });
      });
      
      // Add total_balance updates
      Object.entries(balances).forEach(([id, current_balance]) => {
        updates.push({ id, current_balance });
      });
      
      await onSubmit(updates);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  // Separate assets by pricing method
  const variableIncomeAssets = assets.filter((a) => !usesTotalBalancePricing(a.asset_type));
  const fixedIncomeAssets = assets.filter((a) => usesTotalBalancePricing(a.asset_type));

  // Group variable income by type
  const variableByType = variableIncomeAssets.reduce((acc, asset) => {
    if (!acc[asset.asset_type]) {
      acc[asset.asset_type] = [];
    }
    acc[asset.asset_type].push(asset);
    return acc;
  }, {} as Record<string, InvestmentAsset[]>);

  // Group fixed income by type
  const fixedByType = fixedIncomeAssets.reduce((acc, asset) => {
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
          <DialogTitle>Atualizar Carteira</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Variable Income Section */}
          {variableIncomeAssets.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm text-foreground mb-4 flex items-center gap-2">
                📈 Renda Variável
                <span className="text-xs text-muted-foreground font-normal">
                  (Atualizar cotação unitária)
                </span>
              </h3>
              
              {Object.entries(variableByType).map(([type, typeAssets]) => (
                <div key={type} className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    {ASSET_TYPE_LABELS[type]}
                  </p>
                  <div className="space-y-2">
                    {typeAssets.map((asset) => (
                      <div key={asset.id} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{asset.ticker}</p>
                          <p className="text-xs text-muted-foreground">
                            PM: {formatCurrency(asset.average_price)}
                          </p>
                        </div>
                        <div className="w-28">
                          <Label className="sr-only">Cotação</Label>
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
                            className="text-right h-9"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Fixed Income Section */}
          {fixedIncomeAssets.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm text-foreground mb-2 flex items-center gap-2">
                🏦 Renda Fixa / Saldo
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Consulte o saldo bruto atual no app da sua corretora e insira aqui.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Atualizar saldo total bruto
              </p>
              
              {Object.entries(fixedByType).map(([type, typeAssets]) => (
                <div key={type} className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    {ASSET_TYPE_LABELS[type]}
                  </p>
                  <div className="space-y-2">
                    {typeAssets.map((asset) => {
                      const appliedValue = asset.quantity * asset.average_price;
                      return (
                        <div key={asset.id} className="p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{asset.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Aplicado: {formatCurrency(appliedValue)}</span>
                                {asset.yield_info && (
                                  <span className="px-1.5 py-0.5 bg-muted rounded text-xs">
                                    {asset.yield_info}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">
                              Saldo atual:
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={balances[asset.id] || 0}
                              onChange={(e) =>
                                setBalances((prev) => ({
                                  ...prev,
                                  [asset.id]: parseFloat(e.target.value) || 0,
                                }))
                              }
                              className="text-right h-9"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

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
            {isSubmitting ? "Salvando..." : "Salvar Atualizações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

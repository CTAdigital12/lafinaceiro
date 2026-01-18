import { useState } from "react";
import { Trash2, ChevronDown, ChevronRight, Pencil, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InvestmentAsset, ASSET_TYPE_LABELS, getAssetPatrimony, getAssetAppliedValue, usesTotalBalancePricing } from "@/hooks/useInvestments";
import { InvestmentInstitution } from "@/hooks/useInstitutions";
import { cn } from "@/lib/utils";
import { differenceInDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AssetTableProps {
  assetsByType: Record<string, InvestmentAsset[]>;
  institutions: InvestmentInstitution[];
  onEditAsset: (asset: InvestmentAsset) => void;
  onDeleteAsset: (id: string) => void;
}

function getMaturityStatus(maturityDate: string | null): { status: "expired" | "critical" | "warning" | "ok" | null; daysLeft: number } {
  if (!maturityDate) return { status: null, daysLeft: 0 };
  
  const today = new Date();
  const maturity = parseISO(maturityDate);
  const daysLeft = differenceInDays(maturity, today);
  
  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= 7) return { status: "critical", daysLeft };
  if (daysLeft <= 30) return { status: "warning", daysLeft };
  return { status: "ok", daysLeft };
}

export function AssetTable({ assetsByType, institutions, onEditAsset, onDeleteAsset }: AssetTableProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    renda_fixa: true,
    renda_variavel: true,
    fiis: true,
    crypto: true,
    saldo_corretora: true,
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatNumber = (value: number, decimals = 2) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

  const toggleGroup = (type: string) => {
    setOpenGroups((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const assetTypes = ["renda_fixa", "renda_variavel", "fiis", "crypto", "saldo_corretora"];

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-lg">Meus Investimentos</CardTitle>
      </CardHeader>
      <CardContent>
        {assetTypes.map((type) => {
          const assets = assetsByType[type] || [];
          if (assets.length === 0) return null;

          const groupTotal = assets.reduce((sum, a) => sum + getAssetPatrimony(a), 0);
          const isFixedIncome = usesTotalBalancePricing(type);

          return (
            <Collapsible
              key={type}
              open={openGroups[type]}
              onOpenChange={() => toggleGroup(type)}
              className="mb-4"
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors">
                  <div className="flex items-center gap-2">
                    {openGroups[type] ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{ASSET_TYPE_LABELS[type]}</span>
                    <span className="text-sm text-muted-foreground">({assets.length} ativos)</span>
                  </div>
                  <span className="font-semibold">{formatCurrency(groupTotal)}</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ativo</TableHead>
                      <TableHead>Instituição</TableHead>
                      {type === "renda_fixa" && <TableHead>Vencimento</TableHead>}
                      {isFixedIncome ? (
                        <>
                          <TableHead className="text-right">Aplicado</TableHead>
                          <TableHead className="text-right">Saldo Atual</TableHead>
                          {type === "renda_fixa" && <TableHead>Taxa</TableHead>}
                        </>
                      ) : (
                        <>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">PM</TableHead>
                          <TableHead className="text-right">Cotação</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </>
                      )}
                      <TableHead className="text-right">Rent.</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map((asset) => {
                      const saldo = getAssetPatrimony(asset);
                      const custo = getAssetAppliedValue(asset);
                      const rentabilidade = custo > 0 ? ((saldo - custo) / custo) * 100 : 0;
                      const isProfit = rentabilidade >= 0;
                      const institution = institutions.find((i) => i.id === asset.institution_id);
                      const maturity = getMaturityStatus(asset.maturity_date);

                      return (
                        <TableRow key={asset.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{isFixedIncome ? asset.name : asset.ticker}</p>
                              <p className="text-xs text-muted-foreground">{isFixedIncome ? asset.ticker : asset.name}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {institution ? (
                              <span className="text-sm">
                                {institution.icon} {institution.name}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {type === "renda_fixa" && (
                            <TableCell>
                              {asset.maturity_date ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm">
                                          {format(parseISO(asset.maturity_date), "dd/MM/yyyy", { locale: ptBR })}
                                        </span>
                                        {maturity.status === "expired" && (
                                          <Badge variant="destructive" className="text-xs">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            Vencido
                                          </Badge>
                                        )}
                                        {maturity.status === "critical" && (
                                          <Badge variant="destructive" className="text-xs">
                                            <Clock className="h-3 w-3 mr-1" />
                                            {maturity.daysLeft}d
                                          </Badge>
                                        )}
                                        {maturity.status === "warning" && (
                                          <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-500">
                                            <Clock className="h-3 w-3 mr-1" />
                                            {maturity.daysLeft}d
                                          </Badge>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {maturity.status === "expired" 
                                        ? `Vencido há ${Math.abs(maturity.daysLeft)} dias`
                                        : `Vence em ${maturity.daysLeft} dias`
                                      }
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          )}
                          
                          {isFixedIncome ? (
                            <>
                              <TableCell className="text-right">{formatCurrency(custo)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(saldo)}</TableCell>
                              {type === "renda_fixa" && (
                                <TableCell>
                                  {asset.yield_info ? (
                                    <Badge variant="secondary" className="text-xs">
                                      {asset.yield_info}
                                    </Badge>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                              )}
                            </>
                          ) : (
                            <>
                              <TableCell className="text-right">
                                {formatNumber(asset.quantity, type === "crypto" ? 8 : 0)}
                              </TableCell>
                              <TableCell className="text-right">{formatCurrency(asset.average_price)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(asset.current_price)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(saldo)}</TableCell>
                            </>
                          )}
                          
                          <TableCell className={cn("text-right font-medium", isProfit ? "text-emerald-500" : "text-red-500")}>
                            {isProfit ? "+" : ""}{rentabilidade.toFixed(2)}%
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => onEditAsset(asset)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir Ativo</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir {isFixedIncome ? asset.name : asset.ticker}? Esta ação não pode ser desfeita e também excluirá o histórico de operações.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDeleteAsset(asset.id)}>
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {Object.keys(assetsByType).length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Nenhum ativo cadastrado.</p>
            <p className="text-sm text-muted-foreground">Clique em "Nova Operação" para começar.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

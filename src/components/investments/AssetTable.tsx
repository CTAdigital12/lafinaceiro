import { useState, useMemo } from "react";
import { Trash2, ChevronDown, ChevronRight, Pencil, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
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
import { InvestmentAsset, assetTypeLabel, listAssetTypes, getAssetPatrimony, getAssetAppliedValue, usesTotalBalancePricing } from "@/hooks/useInvestments";
import { InvestmentInstitution } from "@/hooks/useInstitutions";
import { useListSearchSort } from "@/hooks/useListSearchSort";
import { ListSearchInput } from "@/components/ui/list-search-input";
import { ListSortButtons } from "@/components/ui/list-sort-buttons";
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
  // Grupo sem entrada aqui nasce ABERTO (ver `isGroupOpen`): antes o padrão
  // era um objeto fixo de cinco tipos, e qualquer tipo fora dele abriria
  // fechado — mais um jeito de o ativo passar despercebido.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const formatCurrency = useFormatCurrency();

  const formatNumber = (value: number, decimals = 2) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

  // O `?? true` importa: sem entrada no mapa o grupo está ABERTO, e `!undefined`
  // daria `true` de novo — o primeiro clique num grupo nunca tocado não fecharia.
  const toggleGroup = (type: string) => {
    setOpenGroups((prev) => ({ ...prev, [type]: !(prev[type] ?? true) }));
  };

  const isGroupOpen = (type: string) => openGroups[type] ?? true;

  // Derivado dos DADOS, não de uma lista fixa: tipo conhecido mas fora do
  // select (acoes, etfs, bdrs) e até tipo inesperado vindo do banco aparecem
  // como grupo, em vez de sumirem da tabela enquanto contam no total.
  const assetTypes = useMemo(() => listAssetTypes(assetsByType), [assetsByType]);

  // Busca + ordenação globais aplicadas dentro de cada grupo. Roda o hook sobre a
  // lista achatada e re-agrupa por tipo preservando a ordem.
  const allAssets = useMemo(
    () => assetTypes.flatMap((t) => assetsByType[t] || []),
    [assetTypes, assetsByType]
  );
  const typeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of assetTypes) for (const a of assetsByType[t] || []) m.set(a.id, t);
    return m;
  }, [assetTypes, assetsByType]);

  const institutionName = (id: string | null | undefined) =>
    institutions.find((i) => i.id === id)?.name ?? "";

  const { query, setQuery, sort, toggleSort, items: processedAssets } = useListSearchSort(allAssets, {
    searchAccessors: [
      (a) => a.ticker,
      (a) => a.name,
      (a) => institutionName(a.institution_id),
    ],
    sortAccessors: {
      name: (a) => a.ticker || a.name || "",
      institution: (a) => institutionName(a.institution_id),
      applied: (a) => getAssetAppliedValue(a),
      balance: (a) => getAssetPatrimony(a),
      yield: (a) => {
        const saldo = getAssetPatrimony(a);
        const custo = getAssetAppliedValue(a);
        return custo > 0 ? (saldo - custo) / custo : 0;
      },
    },
  });

  const processedByType = useMemo(() => {
    const g: Record<string, InvestmentAsset[]> = {};
    for (const a of processedAssets) {
      const t = typeById.get(a.id);
      if (!t) continue;
      (g[t] ||= []).push(a);
    }
    return g;
  }, [processedAssets, typeById]);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-lg">Meus Investimentos</CardTitle>
      </CardHeader>
      <CardContent>
        {allAssets.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            <ListSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar por ativo ou instituição..."
              className="sm:max-w-xs"
            />
            <ListSortButtons
              options={[
                { key: "name", label: "Ativo" },
                { key: "institution", label: "Instituição" },
                { key: "applied", label: "Aplicado" },
                { key: "balance", label: "Saldo" },
                { key: "yield", label: "Rent." },
              ]}
              activeField={sort.field}
              direction={sort.direction}
              onSort={toggleSort}
              className="sm:ml-auto"
            />
          </div>
        )}
        {assetTypes.map((type) => {
          const assets = processedByType[type] || [];
          if (assets.length === 0) return null;

          const groupTotal = assets.reduce((sum, a) => sum + getAssetPatrimony(a), 0);
          const isFixedIncome = usesTotalBalancePricing(type);

          return (
            <Collapsible
              key={type}
              open={isGroupOpen(type)}
              onOpenChange={() => toggleGroup(type)}
              className="mb-4"
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors">
                  <div className="flex items-center gap-2">
                    {isGroupOpen(type) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{assetTypeLabel(type)}</span>
                    <span className="text-sm text-muted-foreground">({assets.length} ativos)</span>
                  </div>
                  <span className="font-semibold">{formatCurrency(groupTotal)}</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {/* Desktop Table */}
                <div className="hidden md:block">
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
                            {(type === "renda_fixa" || type === "fundos") && <TableHead>Taxa</TableHead>}
                            {(type === "renda_fixa" || type === "fundos") && <TableHead>Liq.</TableHead>}
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
                                {(type === "renda_fixa" || type === "fundos") && (
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
                                {(type === "renda_fixa" || type === "fundos") && (
                                  <TableCell>
                                    {asset.liquidity ? (
                                      <Badge variant="outline" className="text-xs">
                                        {asset.liquidity}
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
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-2 pt-2">
                  {assets.map((asset) => {
                    const saldo = getAssetPatrimony(asset);
                    const custo = getAssetAppliedValue(asset);
                    const rentabilidade = custo > 0 ? ((saldo - custo) / custo) * 100 : 0;
                    const isProfit = rentabilidade >= 0;
                    const institution = institutions.find((i) => i.id === asset.institution_id);
                    const maturity = getMaturityStatus(asset.maturity_date);

                    return (
                      <div key={asset.id} className="border border-border/50 rounded-lg p-3 bg-background/50">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{isFixedIncome ? asset.name : asset.ticker}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {institution ? `${institution.icon} ${institution.name}` : isFixedIncome ? asset.ticker : asset.name}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => onEditAsset(asset)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir Ativo</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir {isFixedIncome ? asset.name : asset.ticker}?
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
                        </div>
                        
                        {type === "renda_fixa" && asset.maturity_date && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-muted-foreground">Venc:</span>
                            <span className="text-xs">{format(parseISO(asset.maturity_date), "dd/MM/yyyy", { locale: ptBR })}</span>
                            {maturity.status === "expired" && (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0">Vencido</Badge>
                            )}
                            {maturity.status === "critical" && (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0">{maturity.daysLeft}d</Badge>
                            )}
                            {maturity.status === "warning" && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-amber-500/20 text-amber-500">{maturity.daysLeft}d</Badge>
                            )}
                          </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Aplicado</p>
                            <p className="font-medium">{formatCurrency(custo)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Saldo Atual</p>
                            <p className="font-medium">{formatCurrency(saldo)}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                          <div className="flex items-center gap-2">
                            {asset.yield_info && (
                              <Badge variant="secondary" className="text-[10px]">{asset.yield_info}</Badge>
                            )}
                            {asset.liquidity && (
                              <Badge variant="outline" className="text-[10px]">{asset.liquidity}</Badge>
                            )}
                          </div>
                          <span className={cn("text-sm font-medium", isProfit ? "text-emerald-500" : "text-red-500")}>
                            {isProfit ? "+" : ""}{rentabilidade.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {allAssets.length > 0 && processedAssets.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Nenhum ativo corresponde à busca.</p>
        )}

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

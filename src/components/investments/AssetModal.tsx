import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { InvestmentAsset, ASSET_TYPE_LABELS, usesTotalBalancePricing } from "@/hooks/useInvestments";
import { InvestmentInstitution } from "@/hooks/useInstitutions";

const formSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  ticker: z.string().min(1, "Ticker é obrigatório"),
  asset_type: z.string().min(1, "Tipo é obrigatório"),
  institution_id: z.string().optional(),
  current_price: z.coerce.number().min(0).default(0),
  maturity_date: z.string().optional(),
  yield_info: z.string().optional(),
  liquidity: z.string().optional(),
  // Variable income fields
  initial_quantity: z.coerce.number().min(0).optional(),
  initial_value: z.coerce.number().min(0).optional(),
  // Fixed income fields
  applied_value: z.coerce.number().min(0).optional(),
  current_balance: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export interface AssetModalFormData extends FormValues {
  calculated_quantity?: number;
  calculated_average_price?: number;
  pricing_method?: "unit_price" | "total_balance";
  liquidity?: string;
}

interface AssetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: InvestmentAsset | null;
  institutions: InvestmentInstitution[];
  onSubmit: (data: AssetModalFormData) => void;
}

export function AssetModal({
  open,
  onOpenChange,
  asset,
  institutions,
  onSubmit,
}: AssetModalProps) {
  const [hasInitialPosition, setHasInitialPosition] = useState(false);
  const [inputMode, setInputMode] = useState<"value" | "quantity">("value");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      ticker: "",
      asset_type: "",
      institution_id: "none",
      current_price: 0,
      maturity_date: "",
      yield_info: "",
      liquidity: "",
      initial_quantity: undefined,
      initial_value: undefined,
      applied_value: undefined,
      current_balance: undefined,
    },
  });

  const assetType = form.watch("asset_type");
  const currentPrice = form.watch("current_price");
  const initialQuantity = form.watch("initial_quantity");
  const initialValue = form.watch("initial_value");
  const appliedValue = form.watch("applied_value");
  const currentBalance = form.watch("current_balance");

  const isFixedIncome = usesTotalBalancePricing(assetType);

  // Calculate estimated balance for variable income
  const estimatedBalance = (() => {
    if (!hasInitialPosition || isFixedIncome) return 0;
    if (inputMode === "quantity" && initialQuantity && currentPrice) {
      return initialQuantity * currentPrice;
    }
    if (inputMode === "value" && initialValue) {
      return initialValue;
    }
    return 0;
  })();

  // Calculate quantity from value for variable income
  const calculatedQuantity = (() => {
    if (!hasInitialPosition || isFixedIncome) return 0;
    if (inputMode === "value" && initialValue && currentPrice > 0) {
      return initialValue / currentPrice;
    }
    return initialQuantity || 0;
  })();

  // Calculate profit for fixed income
  const fixedIncomeProfit = (() => {
    if (!isFixedIncome || !hasInitialPosition) return null;
    const applied = appliedValue || 0;
    const balance = currentBalance || 0;
    if (applied <= 0) return null;
    const profit = balance - applied;
    const percentage = (profit / applied) * 100;
    return { profit, percentage };
  })();

  useEffect(() => {
    if (asset) {
      const hasPosition = asset.quantity > 0 || asset.average_price > 0 || (asset.current_balance || 0) > 0;
      const isFixed = usesTotalBalancePricing(asset.asset_type);
      
      form.reset({
        name: asset.name,
        ticker: asset.ticker,
        asset_type: asset.asset_type,
        institution_id: asset.institution_id || "none",
        current_price: asset.current_price,
        maturity_date: asset.maturity_date || "",
        yield_info: asset.yield_info || "",
        liquidity: asset.liquidity || "",
        initial_quantity: isFixed ? undefined : (asset.quantity || undefined),
        initial_value: undefined,
        applied_value: isFixed ? (asset.quantity * asset.average_price) : undefined,
        current_balance: isFixed ? (asset.current_balance || 0) : undefined,
      });
      setHasInitialPosition(hasPosition);
      setInputMode("quantity");
    } else {
      form.reset({
        name: "",
        ticker: "",
        asset_type: "",
        institution_id: "none",
        current_price: 0,
        maturity_date: "",
        yield_info: "",
        liquidity: "",
        initial_quantity: undefined,
        initial_value: undefined,
        applied_value: undefined,
        current_balance: undefined,
      });
      setHasInitialPosition(false);
      setInputMode("value");
    }
  }, [asset, open, form]);

  const handleSubmit = (values: FormValues) => {
    let calculated_quantity = 0;
    let calculated_average_price = 0;
    let pricing_method: "unit_price" | "total_balance" = "unit_price";
    let finalCurrentBalance = 0;

    const isFixed = usesTotalBalancePricing(values.asset_type);

    if (isFixed) {
      pricing_method = "total_balance";
      if (hasInitialPosition) {
        // For fixed income: quantity=1, average_price=applied_value, current_balance=balance
        calculated_quantity = 1;
        calculated_average_price = values.applied_value || 0;
        finalCurrentBalance = values.current_balance || 0;
      }
    } else {
      pricing_method = "unit_price";
      if (hasInitialPosition) {
        if (inputMode === "quantity" && values.initial_quantity && values.initial_quantity > 0) {
          calculated_quantity = values.initial_quantity;
          calculated_average_price = asset?.average_price || values.current_price;
        } else if (inputMode === "value" && values.initial_value && values.initial_value > 0 && values.current_price > 0) {
          calculated_quantity = values.initial_value / values.current_price;
          calculated_average_price = values.current_price;
        }
      }
    }

    // Auto-generate ticker for fixed income if empty
    let finalTicker = values.ticker.toUpperCase();
    if (isFixed && !finalTicker) {
      finalTicker = values.name.substring(0, 10).toUpperCase().replace(/\s+/g, "_");
    }

    onSubmit({
      ...values,
      ticker: finalTicker,
      institution_id: values.institution_id === "none" ? undefined : values.institution_id || undefined,
      maturity_date: values.maturity_date || undefined,
      yield_info: values.yield_info || undefined,
      liquidity: values.liquidity || undefined,
      calculated_quantity,
      calculated_average_price,
      pricing_method,
      current_balance: finalCurrentBalance,
    });
    onOpenChange(false);
  };

  const formatCurrency = useFormatCurrency();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {asset ? "Editar Ativo" : "Novo Ativo"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Asset Type - Always first */}
            <FormField
              control={form.control}
              name="asset_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Ativo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Conditional fields based on asset type */}
            {assetType && (
              <>
                {isFixedIncome ? (
                  // Fixed Income Fields
                  <>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome do Produto</FormLabel>
                          <FormControl>
                            <Input placeholder="CDB Banco Master 110% CDI" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ticker"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Código (opcional)</FormLabel>
                          <FormControl>
                            <Input placeholder="CDB001" {...field} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Se não informado, será gerado automaticamente
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="institution_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instituição</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Nenhuma</SelectItem>
                              {institutions.map((inst) => (
                                <SelectItem key={inst.id} value={inst.id}>
                                  {inst.icon} {inst.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {(assetType === "renda_fixa" || assetType === "fundos") && (
                      <>
                        {assetType === "renda_fixa" && (
                          <FormField
                            control={form.control}
                            name="maturity_date"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Data de Vencimento</FormLabel>
                                <FormControl>
                                  <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        <FormField
                          control={form.control}
                          name="yield_info"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Rentabilidade Contratada</FormLabel>
                              <FormControl>
                                <Input placeholder="110% CDI ou IPCA+6%" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="liquidity"
                          render={({ field }) => {
                            const quickOptions = ['D+0', 'D+1', 'D+2', 'D+30', 'D+90', 'Vencimento'];
                            const isQuickOption = quickOptions.includes(field.value || '');
                            
                            return (
                              <FormItem>
                                <FormLabel>Liquidez (Prazo de Resgate)</FormLabel>
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {quickOptions.map((option) => (
                                      <Button
                                        key={option}
                                        type="button"
                                        variant={field.value === option ? "default" : "outline"}
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => field.onChange(option)}
                                      >
                                        {option}
                                      </Button>
                                    ))}
                                  </div>
                                  <Input
                                    placeholder="Ou digite outro prazo (ex: D+15, D+60)"
                                    value={isQuickOption ? '' : (field.value || '')}
                                    onChange={(e) => field.onChange(e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                      </>
                    )}

                    {/* Fixed Income Position Section */}
                    <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="hasInitialPosition"
                          checked={hasInitialPosition}
                          onCheckedChange={(checked) => setHasInitialPosition(checked === true)}
                        />
                        <Label htmlFor="hasInitialPosition" className="font-medium cursor-pointer">
                          {asset ? "Editar posição" : "Cadastrar com posição"}
                        </Label>
                      </div>

                      {hasInitialPosition && (
                        <div className="space-y-4 pt-2">
                          <FormField
                            control={form.control}
                            name="applied_value"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Valor Aplicado (R$)</FormLabel>
                                <FormControl>
                                  <CurrencyInput
                                    name={field.name}
                                    ref={field.ref}
                                    onBlur={field.onBlur}
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    placeholder="R$ 10.000,00"
                                  />
                                </FormControl>
                                <p className="text-xs text-muted-foreground">
                                  Valor total que você investiu (custo)
                                </p>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="current_balance"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Saldo Atual Bruto (R$)</FormLabel>
                                <FormControl>
                                  <CurrencyInput
                                    name={field.name}
                                    ref={field.ref}
                                    onBlur={field.onBlur}
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    placeholder="R$ 11.234,56"
                                  />
                                </FormControl>
                                <p className="text-xs text-muted-foreground">
                                  Consulte o saldo no app da sua corretora
                                </p>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {fixedIncomeProfit && (
                            <div className="text-sm bg-background rounded p-3">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Lucro:</span>
                                <span className={`font-medium ${fixedIncomeProfit.profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                                  {formatCurrency(fixedIncomeProfit.profit)} ({fixedIncomeProfit.profit >= 0 ? "+" : ""}{fixedIncomeProfit.percentage.toFixed(2)}%)
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  // Variable Income Fields
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="ticker"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ticker</FormLabel>
                            <FormControl>
                              <Input placeholder="VALE3" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="current_price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cotação Atual</FormLabel>
                            <FormControl>
                              <CurrencyInput
                                name={field.name}
                                ref={field.ref}
                                onBlur={field.onBlur}
                                value={field.value}
                                onValueChange={field.onChange}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome do Ativo</FormLabel>
                          <FormControl>
                            <Input placeholder="Vale S.A." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="institution_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instituição</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione (opcional)" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Nenhuma</SelectItem>
                              {institutions.map((inst) => (
                                <SelectItem key={inst.id} value={inst.id}>
                                  {inst.icon} {inst.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Variable Income Position Section */}
                    <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="hasInitialPosition"
                          checked={hasInitialPosition}
                          onCheckedChange={(checked) => setHasInitialPosition(checked === true)}
                        />
                        <Label htmlFor="hasInitialPosition" className="font-medium cursor-pointer">
                          {asset ? "Editar posição" : "Cadastrar com posição inicial"}
                        </Label>
                      </div>

                      {hasInitialPosition && (
                        <div className="space-y-4 pt-2">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant={inputMode === "value" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setInputMode("value")}
                              className="flex-1"
                            >
                              Valor Total
                            </Button>
                            <Button
                              type="button"
                              variant={inputMode === "quantity" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setInputMode("quantity")}
                              className="flex-1"
                            >
                              Quantidade
                            </Button>
                          </div>

                          {inputMode === "value" ? (
                            <FormField
                              control={form.control}
                              name="initial_value"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Valor Total Aplicado (R$)</FormLabel>
                                  <FormControl>
                                    <CurrencyInput
                                      name={field.name}
                                      ref={field.ref}
                                      onBlur={field.onBlur}
                                      value={field.value}
                                      onValueChange={field.onChange}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          ) : (
                            <FormField
                              control={form.control}
                              name="initial_quantity"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Quantidade de Cotas/Ações</FormLabel>
                                  <FormControl>
                                    <CurrencyInput
                                      name={field.name}
                                      ref={field.ref}
                                      onBlur={field.onBlur}
                                      value={field.value}
                                      onValueChange={field.onChange}
                                      withPrefix={false}
                                      decimalScale={8}
                                      placeholder="0"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {estimatedBalance > 0 && (
                            <div className="text-sm text-muted-foreground bg-background rounded p-3">
                              <div className="flex justify-between">
                                <span>Saldo estimado:</span>
                                <span className="font-medium text-foreground">
                                  {formatCurrency(estimatedBalance)}
                                </span>
                              </div>
                              {inputMode === "value" && currentPrice > 0 && (
                                <div className="flex justify-between mt-1">
                                  <span>Quantidade calculada:</span>
                                  <span className="font-medium text-foreground">
                                    {calculatedQuantity.toFixed(6)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!assetType}>
                {asset ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/errorHandler";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  InvestmentAsset,
  InvestmentTransaction,
  ASSET_TYPE_LABELS,
} from "@/hooks/useInvestments";
import { LinkToAccountSection } from "./LinkToAccountSection";

const formSchema = z
  .object({
    operationType: z.enum(["buy", "sell", "dividend"]),
    assetId: z.string().optional(),
    newAsset: z.boolean().default(false),
    assetName: z.string().optional(),
    assetTicker: z.string().optional(),
    assetType: z.string().optional(),
    date: z.string().min(1, "Data é obrigatória"),
    quantity: z.number().min(0.00000001, "Quantidade deve ser maior que 0"),
    unitPrice: z.number().min(0, "Preço deve ser maior ou igual a 0"),
    fees: z.number().min(0).default(0),
    createExpense: z.boolean().default(false),
    accountId: z.string().optional(),
    categoryId: z.string().optional(),
    // Usado apenas em operationType = "sell".
    linkMode: z.enum(["existing", "new"]).optional(),
    existingTransactionId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.createExpense) return;

    if (!data.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountId"],
        message: "Selecione a conta",
      });
    }

    if (data.operationType === "buy" && !data.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: "Selecione a categoria",
      });
    }

    if (data.operationType === "sell") {
      const linkMode = data.linkMode ?? "existing";
      if (linkMode === "existing" && !data.existingTransactionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["existingTransactionId"],
          message: "Selecione a receita a vincular",
        });
      }
      if (linkMode === "new" && !data.categoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categoryId"],
          message: "Selecione a categoria",
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface OperationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: InvestmentAsset[];
  operation?: InvestmentTransaction | null;
  onSubmit: (data: any) => void;
  onCreateAsset: (data: any) => Promise<any>;
}

export function OperationModal({
  open,
  onOpenChange,
  assets,
  operation,
  onSubmit,
  onCreateAsset,
}: OperationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!operation;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      operationType: "buy",
      newAsset: false,
      date: new Date().toISOString().split("T")[0],
      quantity: 0,
      unitPrice: 0,
      fees: 0,
      createExpense: false,
      linkMode: "existing",
    },
  });

  const operationType = form.watch("operationType");
  const isNewAsset = form.watch("newAsset");
  const quantity = form.watch("quantity");
  const unitPrice = form.watch("unitPrice");
  const fees = form.watch("fees");
  const date = form.watch("date");

  const totalValue = quantity * unitPrice + (operationType === "buy" ? fees : 0);

  // Em edit mode, busca a transação vinculada (se houver) para pré-popular
  // a seção de vinculação. Ela não vem em useUnlinkedIncomes porque está
  // linkada — passamos como `additionalIncome` ao LinkToAccountSection.
  const { data: linkedTx } = useQuery({
    queryKey: ["investment_linked_tx", operation?.linked_transaction_id],
    enabled: !!(open && isEditing && operation?.linked_transaction_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, account_id, category_id, type, amount, description, date")
        .eq("id", operation!.linked_transaction_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Reset / pré-preenchimento. Roda em mudança de `open` e `operation`.
  useEffect(() => {
    if (!open) {
      form.reset();
      return;
    }
    if (operation) {
      form.reset({
        operationType: operation.type,
        assetId: operation.asset_id,
        newAsset: false,
        date: operation.date,
        quantity: operation.quantity,
        unitPrice: operation.unit_price,
        fees: operation.fees,
        createExpense: false, // será setado abaixo quando linkedTx chegar
        linkMode: "existing",
      });
    }
  }, [open, operation, form]);

  // Quando a transação vinculada chega, marca os campos de link.
  useEffect(() => {
    if (!open || !isEditing || !operation || !linkedTx) return;

    if (operation.type === "buy") {
      form.setValue("accountId", linkedTx.account_id);
      form.setValue("categoryId", linkedTx.category_id ?? undefined);
      form.setValue("createExpense", true);
    } else if (operation.type === "sell") {
      // Heurística: se a description começa com "Resgate:" foi auto-criada
      // por nós em linkMode="new". Caso contrário é receita do usuário
      // referenciada em linkMode="existing".
      const isAutoCreated = linkedTx.description?.startsWith("Resgate:") ?? false;
      form.setValue("accountId", linkedTx.account_id);
      if (isAutoCreated) {
        form.setValue("linkMode", "new");
        form.setValue("categoryId", linkedTx.category_id ?? undefined);
      } else {
        form.setValue("linkMode", "existing");
        form.setValue("existingTransactionId", linkedTx.id);
      }
      form.setValue("createExpense", true);
    }
  }, [open, isEditing, operation, linkedTx, form]);

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      let assetId = values.assetId;

      // If creating new asset
      if (values.newAsset && values.assetName && values.assetTicker && values.assetType) {
        const newAsset = await onCreateAsset({
          name: values.assetName,
          ticker: values.assetTicker.toUpperCase(),
          asset_type: values.assetType,
          quantity: 0,
          average_price: 0,
          current_price: values.unitPrice,
        });
        assetId = newAsset.id;
      }

      if (!assetId) {
        form.setError("assetId", { message: "Selecione um ativo" });
        setIsSubmitting(false);
        return;
      }

      // Calculate realized profit for sell operations
      let realizedProfit = null;
      if (values.operationType === "sell") {
        const asset = assets.find((a) => a.id === assetId);
        if (asset) {
          realizedProfit = (values.unitPrice - asset.average_price) * values.quantity;
        }
      }

      await onSubmit({
        asset_id: assetId,
        type: values.operationType,
        date: values.date,
        quantity: values.quantity,
        unit_price: values.unitPrice,
        fees: values.fees,
        total_value: totalValue,
        realized_profit: realizedProfit,
        createExpenseTransaction: values.createExpense,
        accountId: values.accountId,
        categoryId: values.categoryId,
        linkMode: values.operationType === "sell" ? (values.linkMode ?? "existing") : undefined,
        existingTransactionId:
          values.operationType === "sell" && values.linkMode === "existing"
            ? values.existingTransactionId
            : undefined,
      });

      onOpenChange(false);
    } catch (error) {
      logError(error, "OperationModal");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Operação" : "Nova Operação"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {isEditing ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Tabs value={operationType}>
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="buy" disabled>Compra</TabsTrigger>
                          <TabsTrigger value="sell" disabled>Venda / Resgate</TabsTrigger>
                          <TabsTrigger value="dividend" disabled>Dividendo</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Para mudar o tipo, exclua e crie uma nova operação.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Tabs
                value={operationType}
                onValueChange={(v) => form.setValue("operationType", v as any)}
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="buy">Compra</TabsTrigger>
                  <TabsTrigger value="sell">Venda / Resgate</TabsTrigger>
                  <TabsTrigger value="dividend">Dividendo</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {!isEditing && (
              <FormField
                control={form.control}
                name="newAsset"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">Novo ativo (não cadastrado)</FormLabel>
                  </FormItem>
                )}
              />
            )}

            {!isNewAsset ? (
              <FormField
                control={form.control}
                name="assetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ativo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o ativo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {assets.map((asset) => (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.ticker} - {asset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="assetTicker"
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
                    name="assetType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Tipo" />
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
                </div>
                <FormField
                  control={form.control}
                  name="assetName"
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
              </>
            )}

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantidade</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço Unitário</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {operationType === "buy" && (
              <FormField
                control={form.control}
                name="fees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Taxas</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Valor Total</p>
              <p className="text-xl font-bold">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalValue)}
              </p>
            </div>

            {(operationType === "buy" || operationType === "sell") && (
              <LinkToAccountSection
                mode={operationType}
                form={form}
                refDate={date}
                additionalIncome={
                  isEditing &&
                  operation?.type === "sell" &&
                  linkedTx &&
                  !linkedTx.description?.startsWith("Resgate:")
                    ? {
                        id: linkedTx.id,
                        date: linkedTx.date,
                        amount: linkedTx.amount,
                        description: linkedTx.description ?? null,
                      }
                    : null
                }
              />
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Salvando..."
                  : isEditing
                    ? "Salvar alterações"
                    : "Salvar Operação"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

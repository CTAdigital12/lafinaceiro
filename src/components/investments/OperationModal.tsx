import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvestmentAsset, ASSET_TYPE_LABELS } from "@/hooks/useInvestments";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";

const formSchema = z.object({
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
});

type FormValues = z.infer<typeof formSchema>;

interface OperationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: InvestmentAsset[];
  onSubmit: (data: any) => void;
  onCreateAsset: (data: any) => Promise<any>;
}

export function OperationModal({
  open,
  onOpenChange,
  assets,
  onSubmit,
  onCreateAsset,
}: OperationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { accounts } = useAccounts();
  const { categories } = useCategories();

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
    },
  });

  const operationType = form.watch("operationType");
  const isNewAsset = form.watch("newAsset");
  const createExpense = form.watch("createExpense");
  const quantity = form.watch("quantity");
  const unitPrice = form.watch("unitPrice");
  const fees = form.watch("fees");

  const totalValue = quantity * unitPrice + (operationType === "buy" ? fees : 0);

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [open, form]);

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
      });

      onOpenChange(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const expenseCategories = categories.filter((c) => c.type === "expense");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Operação</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <Tabs
              value={operationType}
              onValueChange={(v) => form.setValue("operationType", v as any)}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="buy">Compra</TabsTrigger>
                <TabsTrigger value="sell">Venda</TabsTrigger>
                <TabsTrigger value="dividend">Dividendo</TabsTrigger>
              </TabsList>
            </Tabs>

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

            {operationType === "buy" && (
              <>
                <FormField
                  control={form.control}
                  name="createExpense"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-lg">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="font-normal">
                          Lançar como despesa na conta corrente
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Cria uma transação de saída para manter o saldo atualizado
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                {createExpense && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="accountId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conta</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {accounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Categoria</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {expenseCategories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {cat.icon} {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar Operação"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

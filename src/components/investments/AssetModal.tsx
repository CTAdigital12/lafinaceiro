import { useEffect } from "react";
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
import { InvestmentAsset, ASSET_TYPE_LABELS } from "@/hooks/useInvestments";
import { InvestmentInstitution } from "@/hooks/useInstitutions";

const formSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  ticker: z.string().min(1, "Ticker é obrigatório"),
  asset_type: z.string().min(1, "Tipo é obrigatório"),
  institution_id: z.string().optional(),
  current_price: z.number().min(0).default(0),
});

type FormValues = z.infer<typeof formSchema>;

interface AssetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: InvestmentAsset | null;
  institutions: InvestmentInstitution[];
  onSubmit: (data: FormValues) => void;
}

export function AssetModal({
  open,
  onOpenChange,
  asset,
  institutions,
  onSubmit,
}: AssetModalProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      ticker: "",
      asset_type: "",
      institution_id: "",
      current_price: 0,
    },
  });

  useEffect(() => {
    if (asset) {
      form.reset({
        name: asset.name,
        ticker: asset.ticker,
        asset_type: asset.asset_type,
        institution_id: asset.institution_id || "",
        current_price: asset.current_price,
      });
    } else {
      form.reset({
        name: "",
        ticker: "",
        asset_type: "",
        institution_id: "",
        current_price: 0,
      });
    }
  }, [asset, open, form]);

  const handleSubmit = (values: FormValues) => {
    onSubmit({
      ...values,
      ticker: values.ticker.toUpperCase(),
      institution_id: values.institution_id || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {asset ? "Editar Ativo" : "Novo Ativo"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                name="asset_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
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
                      <SelectItem value="">Nenhuma</SelectItem>
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

            <FormField
              control={form.control}
              name="current_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço Atual</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {asset ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

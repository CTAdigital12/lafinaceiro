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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InvestmentInstitution } from "@/hooks/useInstitutions";

const formSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  icon: z.string().default("🏦"),
  color: z.string().default("#3B82F6"),
});

/** Exportado para os componentes que recebem este payload no `onSubmit`. */
export type InstitutionFormData = z.infer<typeof formSchema>;
type FormValues = InstitutionFormData;

interface InstitutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institution?: InvestmentInstitution | null;
  onSubmit: (data: FormValues) => void;
}

const ICONS = ["🏦", "💳", "📈", "💰", "🏛️", "💵", "📊", "🏠", "🌐", "⭐"];

export function InstitutionModal({
  open,
  onOpenChange,
  institution,
  onSubmit,
}: InstitutionModalProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      icon: "🏦",
      color: "#3B82F6",
    },
  });

  useEffect(() => {
    if (institution) {
      form.reset({
        name: institution.name,
        icon: institution.icon,
        color: institution.color,
      });
    } else {
      form.reset({
        name: "",
        icon: "🏦",
        color: "#3B82F6",
      });
    }
  }, [institution, open, form]);

  const handleSubmit = (values: FormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {institution ? "Editar Instituição" : "Nova Instituição"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: XP Investimentos" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ícone</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {ICONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        className={`text-2xl p-2 rounded-lg border transition-colors ${
                          field.value === icon
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        }`}
                        onClick={() => field.onChange(icon)}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cor</FormLabel>
                  <FormControl>
                    <div className="flex gap-2 items-center">
                      <Input type="color" className="w-16 h-10 p-1" {...field} />
                      <Input 
                        type="text" 
                        value={field.value} 
                        onChange={field.onChange}
                        className="flex-1"
                      />
                    </div>
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
                {institution ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

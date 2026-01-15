import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Loader2, Wallet, CreditCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/useAccounts";
import { useCreditCards, CreditCard as CreditCardType } from "@/hooks/useCreditCards";
import { cn } from "@/lib/utils";

interface PayInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditCard: CreditCardType | null;
}

export function PayInvoiceModal({
  open,
  onOpenChange,
  creditCard,
}: PayInvoiceModalProps) {
  const { accounts } = useAccounts();
  const { payInvoice } = useCreditCards();
  
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens with new card
  useEffect(() => {
    if (open && creditCard) {
      setAmount(Number(creditCard.current_invoice).toFixed(2));
      setAccountId("");
      setDate(new Date());
    }
  }, [open, creditCard]);

  const handleSubmit = async () => {
    if (!creditCard || !accountId || !amount) return;
    
    setIsSubmitting(true);
    try {
      await payInvoice.mutateAsync({
        creditCardId: creditCard.id,
        creditCardName: creditCard.name,
        accountId,
        amount: parseFloat(amount),
        date: format(date, "yyyy-MM-dd"),
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error paying invoice:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const bankAccounts = accounts.filter(acc => acc.type === "bank" || acc.type === "wallet");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Pagar Fatura
          </DialogTitle>
          <DialogDescription>
            {creditCard?.name} - {creditCard?.brand}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Invoice Info */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Fatura Atual</span>
            </div>
            <span className="font-semibold text-expense">
              R$ {Number(creditCard?.current_invoice || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Valor do Pagamento</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                R$
              </span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10"
                placeholder="0,00"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Você pode pagar um valor parcial ou diferente da fatura
            </p>
          </div>

          {/* Account Selection */}
          <div className="space-y-2">
            <Label htmlFor="account">Conta de Origem</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    <span className="flex items-center gap-2">
                      <span>{acc.icon}</span>
                      <span>{acc.name}</span>
                      <span className="text-muted-foreground text-xs">
                        (R$ {Number(acc.current_balance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label>Data do Pagamento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: ptBR }) : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Info about what will happen */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm space-y-1">
            <p className="font-medium text-primary">O que acontecerá:</p>
            <ul className="text-muted-foreground text-xs space-y-1 list-disc list-inside">
              <li>Débito de R$ {parseFloat(amount || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })} na conta selecionada</li>
              <li>Fatura do cartão será zerada/reduzida</li>
              <li>Este pagamento <strong>não</strong> aparecerá nos gráficos de despesas</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !accountId || !amount || parseFloat(amount) <= 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Pagando...
              </>
            ) : (
              "Confirmar Pagamento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

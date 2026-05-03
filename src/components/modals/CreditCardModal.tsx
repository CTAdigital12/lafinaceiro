import { useState, useEffect } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreditCards, CreditCard } from "@/hooks/useCreditCards";
import { detectBankFromName } from "@/lib/bankConfig";
import { Loader2 } from "lucide-react";

interface CreditCardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditCard?: CreditCard | null;
}

const brandOptions = [
  { value: "Visa", label: "Visa" },
  { value: "Mastercard", label: "Mastercard" },
  { value: "Elo", label: "Elo" },
  { value: "American Express", label: "American Express" },
  { value: "Hipercard", label: "Hipercard" },
];

const colorOptions = [
  { value: "from-purple-500 via-purple-600 to-purple-700", label: "Roxo" },
  { value: "from-orange-500 via-orange-600 to-amber-600", label: "Laranja" },
  { value: "from-gray-800 via-gray-900 to-black", label: "Preto" },
  { value: "from-blue-500 via-blue-600 to-blue-700", label: "Azul" },
  { value: "from-green-500 via-green-600 to-green-700", label: "Verde" },
  { value: "from-pink-500 via-pink-600 to-pink-700", label: "Rosa" },
  { value: "from-red-500 via-red-600 to-red-700", label: "Vermelho" },
];

export function CreditCardModal({ open, onOpenChange, creditCard }: CreditCardModalProps) {
  const { createCreditCard, updateCreditCard } = useCreditCards();
  const [name, setName] = useState("");
  const [lastDigits, setLastDigits] = useState("");
  const [brand, setBrand] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [currentInvoice, setCurrentInvoice] = useState("");
  const [dueDate, setDueDate] = useState("10");
  const [closingDate, setClosingDate] = useState("3");
  const [color, setColor] = useState("from-purple-500 via-purple-600 to-purple-700");
  const [detectedBank, setDetectedBank] = useState<string | null>(null);

  const isEditing = !!creditCard;

  // Initialize form with credit card data when editing
  useEffect(() => {
    if (creditCard) {
      setName(creditCard.name);
      setLastDigits(creditCard.last_digits);
      setBrand(creditCard.brand);
      setCreditLimit(String(creditCard.credit_limit));
      setCurrentInvoice(String(creditCard.current_invoice));
      setDueDate(String(creditCard.due_date));
      setClosingDate(String(creditCard.closing_date));
      setColor(creditCard.color);
    } else {
      setName("");
      setLastDigits("");
      setBrand("");
      setCreditLimit("");
      setCurrentInvoice("");
      setDueDate("10");
      setClosingDate("3");
      setColor("from-purple-500 via-purple-600 to-purple-700");
      setDetectedBank(null);
    }
  }, [creditCard, open]);

  // Detect bank from name and auto-set color
  useEffect(() => {
    if (!isEditing) {
      const bank = detectBankFromName(name);
      if (bank) {
        setColor(bank.color);
        setDetectedBank(bank.name);
      } else {
        setDetectedBank(null);
      }
    }
  }, [name, isEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const cardData = {
      name,
      last_digits: lastDigits,
      brand,
      credit_limit: parseFloat(creditLimit) || 0,
      current_invoice: parseFloat(currentInvoice) || 0,
      due_date: parseInt(dueDate) || 10,
      closing_date: parseInt(closingDate) || 3,
      color,
      status: "open" as const,
    };

    if (isEditing && creditCard) {
      updateCreditCard.mutate({ id: creditCard.id, ...cardData }, {
        onSuccess: () => onOpenChange(false)
      });
    } else {
      createCreditCard.mutate(cardData, {
        onSuccess: () => onOpenChange(false)
      });
    }
  };

  const isPending = createCreditCard.isPending || updateCreditCard.isPending;

  const modalTitle = isEditing ? "Editar Cartão de Crédito" : "Novo Cartão de Crédito";
  const modalDescription = isEditing ? "Atualize as informações do seu cartão" : "Adicione um novo cartão para gerenciar suas faturas";

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={modalTitle} description={modalDescription}>
      <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Cartão</Label>
            <Input
              id="name"
              placeholder="Ex: Nubank, Itaú..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            {detectedBank && (
              <p className="text-xs text-income">
                ✓ Banco detectado: {detectedBank}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lastDigits">Últimos 4 dígitos</Label>
              <Input
                id="lastDigits"
                placeholder="1234"
                value={lastDigits}
                onChange={(e) => setLastDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Bandeira</Label>
              <Select value={brand} onValueChange={setBrand} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {brandOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="limit">Limite</Label>
              <Input
                id="limit"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0,00"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                required
              />
            </div>
            {isEditing && (
              <div className="space-y-2">
                <Label htmlFor="invoice">Fatura Atual</Label>
                <Input
                  id="invoice"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0,00"
                  value={currentInvoice}
                  onChange={(e) => setCurrentInvoice(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Dia do Vencimento</Label>
              <Input
                id="dueDate"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                placeholder="10"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closingDate">Dia do Fechamento</Label>
              <Input
                id="closingDate"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                placeholder="3"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Cor do Cartão</Label>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma cor" />
              </SelectTrigger>
              <SelectContent>
                {colorOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded bg-gradient-to-r ${option.value}`} />
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : isEditing ? (
                "Salvar Alterações"
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        </form>
    </ResponsiveDialog>
  );
}

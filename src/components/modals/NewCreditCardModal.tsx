import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreditCards } from "@/hooks/useCreditCards";
import { detectBankFromName, detectCardBrandColor } from "@/lib/bankConfig";
import { Loader2 } from "lucide-react";

interface NewCreditCardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function NewCreditCardModal({ open, onOpenChange }: NewCreditCardModalProps) {
  const { createCreditCard } = useCreditCards();
  const [name, setName] = useState("");
  const [lastDigits, setLastDigits] = useState("");
  const [brand, setBrand] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [dueDate, setDueDate] = useState("10");
  const [closingDate, setClosingDate] = useState("3");
  const [color, setColor] = useState("from-purple-500 via-purple-600 to-purple-700");
  const [detectedBank, setDetectedBank] = useState<string | null>(null);

  // Detect bank from name and auto-set color
  useEffect(() => {
    const bank = detectBankFromName(name);
    if (bank) {
      setColor(bank.color);
      setDetectedBank(bank.name);
    } else {
      setDetectedBank(null);
    }
  }, [name]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    createCreditCard.mutate({
      name,
      last_digits: lastDigits,
      brand,
      credit_limit: parseFloat(creditLimit) || 0,
      current_invoice: 0,
      due_date: parseInt(dueDate) || 10,
      closing_date: parseInt(closingDate) || 3,
      color,
      status: "open",
    }, {
      onSuccess: () => {
        setName("");
        setLastDigits("");
        setBrand("");
        setCreditLimit("");
        setDueDate("10");
        setClosingDate("3");
        setColor("from-purple-500 via-purple-600 to-purple-700");
        setDetectedBank(null);
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Cartão de Crédito</DialogTitle>
          <DialogDescription>
            Adicione um novo cartão para gerenciar suas faturas
          </DialogDescription>
        </DialogHeader>
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

          <div className="space-y-2">
            <Label htmlFor="limit">Limite</Label>
            <Input
              id="limit"
              type="number"
              step="0.01"
              placeholder="0,00"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Dia do Vencimento</Label>
              <Input
                id="dueDate"
                type="number"
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
            <Button type="submit" className="flex-1" disabled={createCreditCard.isPending}>
              {createCreditCard.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

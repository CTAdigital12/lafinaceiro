import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/useAccounts";

interface NewAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const accountTypes = [
  { value: "bank", label: "Conta Corrente", icon: "🏦" },
  { value: "wallet", label: "Carteira", icon: "👛" },
  { value: "savings", label: "Poupança", icon: "🐷" },
  { value: "investment", label: "Investimentos", icon: "📈" },
];

const colorOptions = [
  { value: "from-blue-500 to-blue-600", label: "Azul" },
  { value: "from-purple-500 to-purple-600", label: "Roxo" },
  { value: "from-green-500 to-green-600", label: "Verde" },
  { value: "from-orange-500 to-orange-600", label: "Laranja" },
  { value: "from-red-500 to-red-600", label: "Vermelho" },
  { value: "from-gray-700 to-gray-800", label: "Cinza" },
];

export function NewAccountModal({ open, onOpenChange }: NewAccountModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"bank" | "wallet" | "savings" | "investment">("bank");
  const [balance, setBalance] = useState("");
  const [color, setColor] = useState("from-blue-500 to-blue-600");
  
  const { createAccount } = useAccounts();

  const selectedType = accountTypes.find((t) => t.value === type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await createAccount.mutateAsync({
      name,
      type,
      current_balance: parseFloat(balance) || 0,
      icon: selectedType?.icon || "🏦",
      color,
    });

    // Reset form
    setName("");
    setType("bank");
    setBalance("");
    setColor("from-blue-500 to-blue-600");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nova Conta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Conta</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Nubank, Itaú, Carteira"
              required
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Tipo de Conta</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accountTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Initial Balance */}
          <div className="space-y-2">
            <Label htmlFor="balance">Saldo Inicial</Label>
            <Input
              id="balance"
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0,00"
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Cor</Label>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {colorOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex items-center gap-2">
                      <div className={`h-4 w-4 rounded bg-gradient-to-r ${c.value}`} />
                      {c.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Submit */}
          <Button type="submit" className="w-full" disabled={createAccount.isPending}>
            {createAccount.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Criar Conta"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

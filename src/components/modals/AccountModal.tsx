import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts, Account } from "@/hooks/useAccounts";
import { detectBankFromName } from "@/lib/bankConfig";
import { supabase } from "@/integrations/supabase/client";

interface AccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account | null;
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

export function AccountModal({ open, onOpenChange, account }: AccountModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"bank" | "wallet" | "savings" | "investment">("bank");
  const [balance, setBalance] = useState("");
  const [color, setColor] = useState("from-blue-500 to-blue-600");
  const [icon, setIcon] = useState("🏦");
  const [detectedBank, setDetectedBank] = useState<string | null>(null);
  
  const { createAccount, updateAccount } = useAccounts();
  const isEditing = !!account;

  // Initialize form with account data when editing
  useEffect(() => {
    if (account) {
      setName(account.name);
      setType(account.type);
      setBalance(String(account.computed_balance));
      setColor(account.color);
      setIcon(account.icon);
    } else {
      setName("");
      setType("bank");
      setBalance("");
      setColor("from-blue-500 to-blue-600");
      setIcon("🏦");
      setDetectedBank(null);
    }
  }, [account, open]);

  // Detect bank from name
  useEffect(() => {
    if (!isEditing) {
      const bank = detectBankFromName(name);
      if (bank) {
        setColor(bank.color);
        setIcon(bank.icon);
        setDetectedBank(bank.name);
      } else {
        setDetectedBank(null);
        const selectedType = accountTypes.find((t) => t.value === type);
        setIcon(selectedType?.icon || "🏦");
      }
    }
  }, [name, type, isEditing]);

  const selectedType = accountTypes.find((t) => t.value === type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const balanceValue = parseFloat(balance) || 0;
    const accountData = {
      name,
      type,
      current_balance: balanceValue,
      icon: detectedBank ? icon : (selectedType?.icon || "🏦"),
      color,
    };

    if (isEditing && account) {
      // Compute initial_balance = desired_balance - sum(realized transactions)
      // so that computed_balance = initial_balance + sum(realized) = desired_balance
      const today = new Date().toISOString().split("T")[0];
      const { data: txData } = await supabase
        .from("transactions")
        .select("type, amount, status, is_provisional, date")
        .eq("account_id", account.id)
        .eq("status", "completed")
        .eq("is_provisional", false)
        .lte("date", today);

      const txNet = (txData || []).reduce((sum, tx) => {
        const sign = tx.type === "income" ? 1 : -1;
        return sum + sign * Number(tx.amount);
      }, 0);

      const newInitialBalance = balanceValue - txNet;
      await updateAccount.mutateAsync({ id: account.id, ...accountData, initial_balance: newInitialBalance });
    } else {
      // New account: no transactions yet, so initial_balance = entered balance
      await createAccount.mutateAsync(accountData);
    }

    onOpenChange(false);
  };

  const isPending = createAccount.isPending || updateAccount.isPending;

  const modalTitle = isEditing ? "Editar Conta" : "Nova Conta";

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={modalTitle}>
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
            {detectedBank && (
              <p className="text-xs text-income flex items-center gap-1">
                {icon} Banco detectado: {detectedBank}
              </p>
            )}
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

          {/* Balance */}
          <div className="space-y-2">
            <Label htmlFor="balance">{isEditing ? "Saldo Atual" : "Saldo Inicial"}</Label>
            <Input
              id="balance"
              type="number"
              inputMode="decimal"
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
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : isEditing ? (
              "Salvar Alterações"
            ) : (
              "Criar Conta"
            )}
          </Button>
        </form>
    </ResponsiveDialog>
  );
}

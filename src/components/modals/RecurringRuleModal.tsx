import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useAccounts } from "@/hooks/useAccounts";
import { useCreditCards } from "@/hooks/useCreditCards";
import { RecurringRule } from "@/hooks/useRecurringRules";
import { CategorySelector } from "@/components/CategorySelector";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RecurringRuleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule?: RecurringRule | null;
  onSave: (rule: {
    description: string;
    category_id: string | null;
    account_id: string | null;
    credit_card_id: string | null;
    estimated_amount: number;
    type: "income" | "expense";
    day_of_month: number;
    active: boolean;
  }) => void;
}

export function RecurringRuleModal({ open, onOpenChange, editingRule, onSave }: RecurringRuleModalProps) {
  
  const { accounts } = useAccounts();
  const { creditCards } = useCreditCards();

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [creditCardId, setCreditCardId] = useState<string | null>(null);
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState<"account" | "credit_card">("account");

  useEffect(() => {
    if (editingRule) {
      setDescription(editingRule.description);
      setCategoryId(editingRule.category_id);
      setAccountId(editingRule.account_id);
      setCreditCardId(editingRule.credit_card_id);
      setEstimatedAmount(String(editingRule.estimated_amount));
      setType(editingRule.type);
      setDayOfMonth(String(editingRule.day_of_month));
      setPaymentMethod(editingRule.credit_card_id ? "credit_card" : "account");
    } else {
      setDescription("");
      setCategoryId(null);
      setAccountId(null);
      setCreditCardId(null);
      setEstimatedAmount("");
      setType("expense");
      setDayOfMonth("1");
      setPaymentMethod("account");
    }
  }, [editingRule, open]);

  const handleSubmit = () => {
    if (!description.trim() || !estimatedAmount) return;

    onSave({
      description: description.trim(),
      category_id: categoryId,
      account_id: paymentMethod === "account" ? accountId : null,
      credit_card_id: paymentMethod === "credit_card" ? creditCardId : null,
      estimated_amount: parseFloat(estimatedAmount),
      type,
      day_of_month: parseInt(dayOfMonth) || 1,
      active: editingRule?.active ?? true,
    });
    onOpenChange(false);
  };

  

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingRule ? "Editar Recorrência" : "Nova Recorrência"}
    >
      <div className="space-y-4 p-1">
        {/* Description */}
        <div className="space-y-2">
          <Label>Descrição</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Conta de Luz"
          />
        </div>

        {/* Type */}
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v) => { setType(v as "income" | "expense"); setCategoryId(null); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Despesa</SelectItem>
              <SelectItem value="income">Receita</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Estimated Amount */}
        <div className="space-y-2">
          <Label>Valor Estimado (R$)</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={estimatedAmount}
            onChange={(e) => setEstimatedAmount(e.target.value)}
            placeholder="0,00"
          />
        </div>

        {/* Day of Month */}
        <div className="space-y-2">
          <Label>Dia do Vencimento</Label>
          <Input
            type="number"
            inputMode="numeric"
            min="1"
            max="31"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label>Categoria</Label>
          <CategorySelector
            value={categoryId}
            onSelect={(id) => setCategoryId(id)}
            type={type}
          />
        </div>

        {/* Payment Method */}
        <div className="space-y-2">
          <Label>Forma de Pagamento</Label>
          <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "account" | "credit_card")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="account">Conta Bancária</SelectItem>
              <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Account or Credit Card */}
        {paymentMethod === "account" ? (
          <div className="space-y-2">
            <Label>Conta</Label>
            <Select value={accountId || ""} onValueChange={(v) => setAccountId(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Cartão</Label>
            <Select value={creditCardId || ""} onValueChange={(v) => setCreditCardId(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cartão" />
              </SelectTrigger>
              <SelectContent>
                {creditCards.map((card) => (
                  <SelectItem key={card.id} value={card.id}>{card.name} •••• {card.last_digits}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={!description.trim() || !estimatedAmount}>
            {editingRule ? "Salvar" : "Criar"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

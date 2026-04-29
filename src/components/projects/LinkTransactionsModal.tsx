import { useState, useEffect } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { format, subDays } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LinkableTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  categories?: { name: string; icon: string } | null;
}

interface LinkTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onLink: (transactionIds: string[]) => Promise<void>;
  isPending: boolean;
}

export function LinkTransactionsModal({ open, onOpenChange, projectId, onLink, isPending }: LinkTransactionsModalProps) {
  const { user } = useAuth();
  const formatCurrency = useFormatCurrency();
  const [transactions, setTransactions] = useState<LinkableTransaction[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      setSelected(new Set());
      setSearch("");
      loadTransactions();
    }
  }, [open, user]);

  const loadTransactions = async () => {
    setLoading(true);
    const since = format(subDays(new Date(), 90), "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("transactions")
      .select("id, description, amount, date, categories (name, icon)")
      .is("project_id", null)
      .eq("type", "expense")
      .eq("is_refund", false)
      .eq("is_card_payment", false)
      .eq("is_provisional", false)
      .gte("date", since)
      .order("date", { ascending: false })
      .limit(200);

    if (!error && data) {
      setTransactions(data as LinkableTransaction[]);
    }
    setLoading(false);
  };

  const toggleSelection = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = transactions.filter(t =>
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleConfirm = async () => {
    await onLink(Array.from(selected));
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Vincular Despesas"
      description="Selecione despesas dos últimos 90 dias para vincular a este projeto"
    >
      <div className="space-y-4">
        <Input
          placeholder="Buscar por descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <ScrollArea className="h-[300px]" data-vaul-no-drag>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhuma despesa disponível
            </p>
          ) : (
            <div className="space-y-1" data-vaul-no-drag>
              {filtered.map((tx) => (
                <label
                  key={tx.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(tx.id)}
                    onCheckedChange={() => toggleSelection(tx.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {tx.categories?.icon} {tx.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.date + "T12:00:00"), "dd/MM/yyyy")}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-expense">
                    {formatCurrency(tx.amount)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </ScrollArea>

        <Button
          className="w-full"
          disabled={selected.size === 0 || isPending}
          onClick={handleConfirm}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Vinculando...
            </>
          ) : (
            `Vincular ${selected.size} despesa${selected.size !== 1 ? "s" : ""}`
          )}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}

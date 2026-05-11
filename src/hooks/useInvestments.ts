import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export type PricingMethod = "unit_price" | "total_balance";

export interface InvestmentAsset {
  id: string;
  user_id: string;
  name: string;
  ticker: string;
  asset_type: "renda_fixa" | "renda_variavel" | "fundos" | "crypto" | "saldo_corretora" | "acoes" | "etfs" | "bdrs";
  quantity: number;
  average_price: number;
  current_price: number;
  institution_id: string | null;
  maturity_date: string | null;
  pricing_method: PricingMethod;
  current_balance: number;
  yield_info: string | null;
  liquidity: string | null;
  created_at: string;
  updated_at: string;
}

// Helper to determine if asset uses total_balance pricing
export const usesTotalBalancePricing = (assetType: string): boolean => {
  return ["renda_fixa", "saldo_corretora"].includes(assetType);
};

// Helper to get the patrimony value of an asset
export const getAssetPatrimony = (asset: InvestmentAsset): number => {
  if (asset.pricing_method === "total_balance") {
    return asset.current_balance || 0;
  }
  return asset.quantity * asset.current_price;
};

// Helper to get the applied value of an asset
export const getAssetAppliedValue = (asset: InvestmentAsset): number => {
  return asset.quantity * asset.average_price;
};

export interface InvestmentTransaction {
  id: string;
  user_id: string;
  asset_id: string;
  type: "buy" | "sell" | "dividend";
  quantity: number;
  unit_price: number;
  fees: number;
  total_value: number;
  date: string;
  realized_profit: number | null;
  linked_transaction_id: string | null;
  notes: string | null;
  created_at: string;
  asset?: InvestmentAsset;
}

export const ASSET_TYPE_LABELS: Record<string, string> = {
  renda_fixa: "Renda Fixa",
  renda_variavel: "Renda Variável",
  fundos: "Fundos de Investimentos",
  crypto: "Criptomoedas",
  saldo_corretora: "Saldo em Corretora",
};

export function useInvestments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all assets
  const { data: assets = [], isLoading: isLoadingAssets } = useQuery({
    queryKey: ["investment_assets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investment_assets")
        .select("*")
        .order("asset_type", { ascending: true })
        .order("ticker", { ascending: true });

      if (error) throw error;
      return data as InvestmentAsset[];
    },
    enabled: !!user,
  });

  // Fetch all transactions
  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["investment_transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investment_transactions")
        .select("*, asset:investment_assets(*)")
        .order("date", { ascending: false });

      if (error) throw error;
      return data as (InvestmentTransaction & { asset: InvestmentAsset })[];
    },
    enabled: !!user,
  });

  // Create asset
  const createAsset = useMutation({
    mutationFn: async (asset: Omit<InvestmentAsset, "id" | "user_id" | "created_at" | "updated_at">) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }
      
      const { data, error } = await supabase
        .from("investment_assets")
        .insert([{ ...asset, user_id: user.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_assets"] });
      toast({ title: "Ativo criado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar ativo", description: error.message, variant: "destructive" });
    },
  });

  // Update asset
  const updateAsset = useMutation({
    mutationFn: async ({ id, ...asset }: Partial<InvestmentAsset> & { id: string }) => {
      const { data, error } = await supabase
        .from("investment_assets")
        .update(asset)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_assets"] });
      toast({ title: "Ativo atualizado!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar ativo", description: error.message, variant: "destructive" });
    },
  });

  // Delete asset
  const deleteAsset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investment_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_assets"] });
      queryClient.invalidateQueries({ queryKey: ["investment_transactions"] });
      toast({ title: "Ativo excluído!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir ativo", description: error.message, variant: "destructive" });
    },
  });

  // Create transaction (buy/sell/dividend)
  const createTransaction = useMutation({
    mutationFn: async (
      transaction: Omit<InvestmentTransaction, "id" | "user_id" | "created_at" | "asset"> & {
        createExpenseTransaction?: boolean;
        accountId?: string;
        categoryId?: string;
        linkMode?: "existing" | "new";
        existingTransactionId?: string;
      }
    ) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }

      const {
        createExpenseTransaction,
        accountId,
        categoryId,
        linkMode,
        existingTransactionId,
        ...txData
      } = transaction;

      // Insert investment transaction
      const { data: investmentTx, error: txError } = await supabase
        .from("investment_transactions")
        .insert([{ ...txData, user_id: user.id }])
        .select()
        .single();

      if (txError) throw txError;

      // Helper: deleta a investment_transaction recém-criada se as etapas
      // subsequentes falharem. Evita "fantasmas" (venda registrada sem
      // movimentação no asset/conta). Compensação simples sem RPC.
      const rollbackInvestmentTx = async () => {
        await supabase
          .from("investment_transactions")
          .delete()
          .eq("id", investmentTx.id);
      };

      try {
        // Update asset based on transaction type
        const asset = assets.find((a) => a.id === txData.asset_id);
        if (asset) {
          if (txData.type === "buy") {
            // Calculate new average price
            const currentTotal = asset.quantity * asset.average_price;
            const newTotal = txData.quantity * txData.unit_price + txData.fees;
            const newQuantity = asset.quantity + txData.quantity;
            const newAveragePrice = newQuantity > 0 ? (currentTotal + newTotal) / newQuantity : 0;

            const { error: updErr } = await supabase
              .from("investment_assets")
              .update({
                quantity: newQuantity,
                average_price: newAveragePrice,
              })
              .eq("id", asset.id);
            if (updErr) throw updErr;
          } else if (txData.type === "sell") {
            const newQuantity = asset.quantity - txData.quantity;
            const { error: updErr } = await supabase
              .from("investment_assets")
              .update({ quantity: Math.max(0, newQuantity) })
              .eq("id", asset.id);
            if (updErr) throw updErr;
          }
          // Dividends don't affect quantity or average price
        }

        // ===== Link com transactions na conta corrente =====
        // BUY → cria expense (comportamento original).
        // SELL → vincula a uma income existente ou cria nova income.
        if (createExpenseTransaction && accountId) {
          let linkedTxId: string | null = null;

          if (txData.type === "buy") {
            const { data: linkedTx, error: linkedError } = await supabase
              .from("transactions")
              .insert([
                {
                  user_id: user.id,
                  account_id: accountId,
                  category_id: categoryId || null,
                  description: `Investimento: ${asset?.ticker || "Ativo"}`,
                  amount: txData.total_value,
                  type: "expense",
                  date: txData.date,
                  status: "completed",
                  is_corporate_expense: false,
                },
              ])
              .select()
              .single();
            if (linkedError) throw linkedError;
            linkedTxId = linkedTx.id;
          } else if (txData.type === "sell") {
            const effectiveLinkMode = linkMode ?? "existing";

            if (effectiveLinkMode === "existing") {
              if (!existingTransactionId) {
                throw new Error("Selecione a receita a vincular");
              }
              // Validar elegibilidade. NOTA: a RLS de SELECT em `transactions`
              // permite leitura cross-tenant via `shared_access`, então validar
              // `user_id` é DEFESA EM PROFUNDIDADE obrigatória — não confiar
              // apenas em RLS. Sem essa checagem, um usuário com acesso
              // compartilhado poderia "sequestrar" uma receita do dono ao
              // linkar pelo UNIQUE índice em linked_transaction_id.
              const { data: candidate, error: candErr } = await supabase
                .from("transactions")
                .select("id, type, account_id, user_id")
                .eq("id", existingTransactionId)
                .maybeSingle();
              if (candErr) throw candErr;
              if (!candidate) throw new Error("Receita não encontrada");
              if (candidate.user_id !== user.id) {
                throw new Error("Esta receita não pertence ao seu usuário");
              }
              if (candidate.type !== "income") {
                throw new Error("A transação selecionada não é uma receita");
              }
              if (candidate.account_id !== accountId) {
                throw new Error("A receita não pertence à conta selecionada");
              }

              // Checa se já está linkada (UX melhor que erro 23505 cru).
              const { count: linkedCount, error: countErr } = await supabase
                .from("investment_transactions")
                .select("id", { count: "exact", head: true })
                .eq("linked_transaction_id", existingTransactionId);
              if (countErr) throw countErr;
              if ((linkedCount ?? 0) > 0) {
                throw new Error("Esta receita já está vinculada a outra operação");
              }

              linkedTxId = existingTransactionId;
            } else if (effectiveLinkMode === "new") {
              if (!categoryId) {
                throw new Error("Selecione a categoria da receita");
              }
              const { data: newTx, error: newErr } = await supabase
                .from("transactions")
                .insert([
                  {
                    user_id: user.id,
                    account_id: accountId,
                    category_id: categoryId,
                    description: `Resgate: ${asset?.ticker || "Ativo"}`,
                    amount: txData.total_value,
                    type: "income",
                    date: txData.date,
                    status: "completed",
                    is_corporate_expense: false,
                  },
                ])
                .select()
                .single();
              if (newErr) throw newErr;
              linkedTxId = newTx.id;
            }
          }

          if (linkedTxId) {
            const { error: linkErr } = await supabase
              .from("investment_transactions")
              .update({ linked_transaction_id: linkedTxId })
              .eq("id", investmentTx.id);
            if (linkErr) {
              // 23505 = unique_violation no novo índice parcial.
              if ((linkErr as { code?: string }).code === "23505") {
                throw new Error(
                  "Esta receita já está vinculada a outra operação (conflito)."
                );
              }
              throw linkErr;
            }
          }
        }

        return investmentTx;
      } catch (err) {
        await rollbackInvestmentTx();
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_assets"] });
      queryClient.invalidateQueries({ queryKey: ["investment_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked_incomes"] });
      toast({ title: "Operação registrada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao registrar operação", description: error.message, variant: "destructive" });
    },
  });

  // Delete transaction
  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investment_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked_incomes"] });
      toast({ title: "Operação excluída!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir operação", description: error.message, variant: "destructive" });
    },
  });

  // Bulk update prices (supports both unit_price and total_balance)
  const updatePrices = useMutation({
    mutationFn: async (updates: { id: string; current_price?: number; current_balance?: number }[]) => {
      const promises = updates.map((update) => {
        const updateData: { current_price?: number; current_balance?: number } = {};
        if (update.current_price !== undefined) {
          updateData.current_price = update.current_price;
        }
        if (update.current_balance !== undefined) {
          updateData.current_balance = update.current_balance;
        }
        return supabase
          .from("investment_assets")
          .update(updateData)
          .eq("id", update.id);
      });
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_assets"] });
      toast({ title: "Cotações atualizadas!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar cotações", description: error.message, variant: "destructive" });
    },
  });

  // Calculated values - using conditional logic based on pricing_method
  const totalPatrimony = assets.reduce((sum, a) => sum + getAssetPatrimony(a), 0);
  const totalApplied = assets.reduce((sum, a) => sum + getAssetAppliedValue(a), 0);
  const totalResult = totalPatrimony - totalApplied;
  const resultPercentage = totalApplied > 0 ? (totalResult / totalApplied) * 100 : 0;

  // Group assets by type
  const assetsByType = assets.reduce((acc, asset) => {
    if (!acc[asset.asset_type]) {
      acc[asset.asset_type] = [];
    }
    acc[asset.asset_type].push(asset);
    return acc;
  }, {} as Record<string, InvestmentAsset[]>);

  // Allocation data for chart - using correct patrimony calculation
  const allocationData = Object.entries(assetsByType).map(([type, typeAssets]) => ({
    name: ASSET_TYPE_LABELS[type] || type,
    value: typeAssets.reduce((sum, a) => sum + getAssetPatrimony(a), 0),
  }));

  return {
    assets,
    transactions,
    isLoading: isLoadingAssets || isLoadingTransactions,
    totalPatrimony,
    totalApplied,
    totalResult,
    resultPercentage,
    assetsByType,
    allocationData,
    createAsset,
    updateAsset,
    deleteAsset,
    createTransaction,
    deleteTransaction,
    updatePrices,
  };
}

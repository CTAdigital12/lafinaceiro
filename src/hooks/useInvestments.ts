import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  computeAssetUpdateOnBuy,
  computeAssetUpdateOnSell,
  computeAssetUpdateOnBuyReverse,
  computeAssetUpdateOnSellReverse,
  type AssetUpdatePayload,
} from "@/lib/investments/assetMutation";
import { validateLinkCandidate } from "@/lib/investments/linkCandidate";
import { assetTypeLabel, type AssetType } from "@/lib/investments/assetTypes";

export type PricingMethod = "unit_price" | "total_balance";

// A união, os rótulos e a ordem de exibição vivem em `@/lib/investments/assetTypes`
// para serem testáveis sem o cliente Supabase. Re-exportados aqui porque as telas
// de investimentos já importavam tudo deste hook.
export {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  SELECTABLE_ASSET_TYPES,
  assetTypeLabel,
  listAssetTypes,
  selectableTypesFor,
} from "@/lib/investments/assetTypes";
export type { AssetType } from "@/lib/investments/assetTypes";

export interface InvestmentAsset {
  id: string;
  user_id: string;
  name: string;
  ticker: string;
  asset_type: AssetType;
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

/**
 * Payload de criação de ativo.
 *
 * Fora do obrigatório: chave, dono e carimbos (o banco preenche), mais os
 * campos que só fazem sentido em parte dos tipos de ativo — instituição,
 * vencimento, taxa e liquidez são de renda fixa; `pricing_method` e
 * `current_balance` têm DEFAULT. Quem cria um ativo pela operação de compra
 * informa só nome, ticker, tipo e preço.
 */
export type NovoAtivo = Omit<
  InvestmentAsset,
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "institution_id"
  | "maturity_date"
  | "pricing_method"
  | "current_balance"
  | "yield_info"
  | "liquidity"
> & {
  institution_id?: string | null;
  maturity_date?: string | null;
  pricing_method?: PricingMethod;
  current_balance?: number;
  yield_info?: string | null;
  liquidity?: string | null;
};

/**
 * Payload de criação de operação.
 *
 * Além das colunas, carrega os campos que só existem para orquestrar o efeito
 * colateral no extrato — criar a despesa da compra, ou vincular a receita do
 * resgate. Eles são retirados antes do insert.
 */
export type NovaOperacao = Omit<
  InvestmentTransaction,
  "id" | "user_id" | "created_at" | "asset" | "linked_transaction_id" | "notes"
> & {
  // Colunas nulas por natureza: nenhum ponto de criação as informa.
  linked_transaction_id?: string | null;
  notes?: string | null;
  createExpenseTransaction?: boolean;
  accountId?: string;
  categoryId?: string;
  linkMode?: "existing" | "new";
  existingTransactionId?: string;
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
    mutationFn: async (asset: NovoAtivo) => {
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

  // ============================================================
  // Helpers privados compartilhados entre create/update/delete.
  // Fechamento sobre `supabase` e `user`; não exportar.
  // ============================================================

  type TxMutationFields = {
    type: "buy" | "sell" | "dividend";
    quantity: number;
    unit_price: number;
    fees: number;
    total_value: number;
  };

  /**
   * Aplica a mutação ao ativo (compra incrementa, venda decrementa). Espera
   * que o caller forneça o estado atual *fresco* do ativo — em update flow,
   * isso significa re-buscar do DB após o reverse.
   */
  async function applyAssetMutationForTx(
    asset: InvestmentAsset,
    tx: TxMutationFields,
  ) {
    let payload: AssetUpdatePayload | null = null;
    if (tx.type === "buy") {
      payload = computeAssetUpdateOnBuy(asset, {
        quantity: tx.quantity,
        unit_price: tx.unit_price,
        fees: tx.fees,
      });
    } else if (tx.type === "sell") {
      payload = computeAssetUpdateOnSell(asset, {
        quantity: tx.quantity,
        total_value: tx.total_value,
      });
    }
    if (payload) {
      const { error } = await supabase
        .from("investment_assets")
        .update(payload)
        .eq("id", asset.id);
      if (error) throw error;
    }
  }

  /**
   * Reverte a mutação previamente aplicada ao ativo. Usado em edit/delete.
   * Para o caveat sobre preço médio em compras antigas, ver
   * `computeAssetUpdateOnBuyReverse`.
   */
  async function reverseAssetMutationForTx(
    asset: InvestmentAsset,
    tx: TxMutationFields,
  ) {
    let payload: AssetUpdatePayload | null = null;
    if (tx.type === "buy") {
      payload = computeAssetUpdateOnBuyReverse(asset, {
        quantity: tx.quantity,
        unit_price: tx.unit_price,
        fees: tx.fees,
      });
    } else if (tx.type === "sell") {
      payload = computeAssetUpdateOnSellReverse(asset, {
        quantity: tx.quantity,
        total_value: tx.total_value,
      });
    }
    if (payload) {
      const { error } = await supabase
        .from("investment_assets")
        .update(payload)
        .eq("id", asset.id);
      if (error) throw error;
    }
  }

  /**
   * Cria/linka a `transactions` na conta corrente e amarra no
   * `investment_transactions.linked_transaction_id`.
   *
   * - BUY → cria expense (sempre auto-criada).
   * - SELL `linkMode="existing"` → valida candidato + checa se já não está
   *   vinculada a OUTRA operação, e linka.
   * - SELL `linkMode="new"` → cria income "Resgate: TICKER".
   *
   * Chamada pelo create (com row recém-inserida) e pelo update (após o
   * passo que limpou `linked_transaction_id` para NULL).
   */
  async function createOrLinkTransactionForOp(
    investmentTxId: string,
    tx: TxMutationFields & { date: string },
    opts: {
      accountId: string;
      categoryId?: string;
      linkMode?: "existing" | "new";
      existingTransactionId?: string;
      assetTicker?: string;
    },
  ) {
    if (!user?.id) throw new Error("Usuário não autenticado");

    let linkedTxId: string | null = null;

    if (tx.type === "buy") {
      const { data: linkedTx, error: linkedError } = await supabase
        .from("transactions")
        .insert([
          {
            user_id: user.id,
            account_id: opts.accountId,
            category_id: opts.categoryId || null,
            description: `Investimento: ${opts.assetTicker || "Ativo"}`,
            amount: tx.total_value,
            type: "expense",
            date: tx.date,
            status: "completed",
            is_corporate_expense: false,
          },
        ])
        .select()
        .single();
      if (linkedError) throw linkedError;
      linkedTxId = linkedTx.id;
    } else if (tx.type === "sell") {
      const effectiveLinkMode = opts.linkMode ?? "existing";

      if (effectiveLinkMode === "existing") {
        if (!opts.existingTransactionId) {
          throw new Error("Selecione a receita a vincular");
        }
        // Defesa em profundidade contra RLS cross-tenant via shared_access.
        const { data: candidate, error: candErr } = await supabase
          .from("transactions")
          .select("id, type, account_id, user_id")
          .eq("id", opts.existingTransactionId)
          .maybeSingle();
        if (candErr) throw candErr;
        const validation = validateLinkCandidate(candidate, user.id, opts.accountId);
        if (!validation.ok) {
          throw new Error(validation.message);
        }

        // Exclui a própria investment_transaction da checagem — relevante
        // no update flow caso o usuário re-selecione a mesma receita.
        const { count: linkedCount, error: countErr } = await supabase
          .from("investment_transactions")
          .select("id", { count: "exact", head: true })
          .eq("linked_transaction_id", opts.existingTransactionId)
          .neq("id", investmentTxId);
        if (countErr) throw countErr;
        if ((linkedCount ?? 0) > 0) {
          throw new Error("Esta receita já está vinculada a outra operação");
        }

        linkedTxId = opts.existingTransactionId;
      } else if (effectiveLinkMode === "new") {
        if (!opts.categoryId) {
          throw new Error("Selecione a categoria da receita");
        }
        const { data: newTx, error: newErr } = await supabase
          .from("transactions")
          .insert([
            {
              user_id: user.id,
              account_id: opts.accountId,
              category_id: opts.categoryId,
              description: `Resgate: ${opts.assetTicker || "Ativo"}`,
              amount: tx.total_value,
              type: "income",
              date: tx.date,
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
        .eq("id", investmentTxId);
      if (linkErr) {
        if ((linkErr as { code?: string }).code === "23505") {
          throw new Error(
            "Esta receita já está vinculada a outra operação (conflito)."
          );
        }
        throw linkErr;
      }
    }
  }

  /**
   * Apaga a transação vinculada APENAS se foi auto-criada por nós.
   * Heurística: buy sempre auto-cria expense (deletar). Sell só auto-cria
   * quando `linkMode="new"`, identificável por description começando com
   * "Resgate: ". Receitas pré-existentes do usuário permanecem.
   */
  async function deleteOwnedLinkedTransaction(
    linkedTransactionId: string,
    txType: "buy" | "sell" | "dividend",
  ) {
    if (txType === "buy") {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", linkedTransactionId);
      if (error) throw error;
      return;
    }
    if (txType === "sell") {
      const { data: linkedRow } = await supabase
        .from("transactions")
        .select("description")
        .eq("id", linkedTransactionId)
        .maybeSingle();
      if (linkedRow?.description?.startsWith("Resgate:")) {
        const { error } = await supabase
          .from("transactions")
          .delete()
          .eq("id", linkedTransactionId);
        if (error) throw error;
      }
    }
  }

  // ============================================================
  // Create transaction (buy/sell/dividend)
  // ============================================================
  const createTransaction = useMutation({
    mutationFn: async (transaction: NovaOperacao) => {
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

      // Compensação simples sem RPC: se as etapas seguintes falharem,
      // deleta a investment_transaction recém-criada pra evitar "fantasma".
      const rollbackInvestmentTx = async () => {
        await supabase
          .from("investment_transactions")
          .delete()
          .eq("id", investmentTx.id);
      };

      try {
        const asset = assets.find((a) => a.id === txData.asset_id);
        if (asset) {
          await applyAssetMutationForTx(asset, txData);
        }

        if (createExpenseTransaction && accountId) {
          await createOrLinkTransactionForOp(investmentTx.id, txData, {
            accountId,
            categoryId,
            linkMode,
            existingTransactionId,
            assetTicker: asset?.ticker,
          });
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

  // ============================================================
  // Update transaction — reverse + reapply.
  //
  // Não-atômico (sem RPC). Em caso de falha pós-reverse, tenta restaurar
  // best-effort. TODO: futura RPC `update_investment_transaction_atomic`.
  // ============================================================
  const updateTransaction = useMutation({
    // Mesmo payload da criação, mais o id. Antes era a união inteira escrita
    // de novo aqui, com uma diferença silenciosa: exigia
    // `linked_transaction_id` e `notes`, que a tela nunca informa.
    mutationFn: async (input: NovaOperacao & { id: string }) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }

      const {
        id,
        createExpenseTransaction,
        accountId,
        categoryId,
        linkMode,
        existingTransactionId,
        ...txData
      } = input;

      // 1. Snapshot da row antiga (com asset). Fresco do DB, não do cache.
      const { data: oldTxRaw, error: oldErr } = await supabase
        .from("investment_transactions")
        .select("*, asset:investment_assets(*)")
        .eq("id", id)
        .single();
      if (oldErr) throw oldErr;
      const oldTx = oldTxRaw as InvestmentTransaction & { asset: InvestmentAsset };
      const oldAsset = oldTx.asset;

      // 2. Reverter efeito no ativo antigo.
      if (oldAsset) {
        await reverseAssetMutationForTx(oldAsset, {
          type: oldTx.type,
          quantity: oldTx.quantity,
          unit_price: oldTx.unit_price,
          fees: oldTx.fees,
          total_value: oldTx.total_value,
        });
      }

      // 3. Lidar com transação vinculada antiga.
      if (oldTx.linked_transaction_id) {
        await deleteOwnedLinkedTransaction(oldTx.linked_transaction_id, oldTx.type);
      }

      // 4. Atualizar a row e zerar o link (passo 6 vai re-setar se aplicável).
      const { error: updErr } = await supabase
        .from("investment_transactions")
        .update({
          asset_id: txData.asset_id,
          type: txData.type,
          quantity: txData.quantity,
          unit_price: txData.unit_price,
          fees: txData.fees,
          total_value: txData.total_value,
          date: txData.date,
          realized_profit: txData.realized_profit,
          linked_transaction_id: null,
          notes: txData.notes,
        })
        .eq("id", id);
      if (updErr) throw updErr;

      // 5. Re-buscar o ativo destino (pode ter mudado, ou ter sido afetado
      //    pelo reverse acima). Cache não é confiável aqui.
      const { data: freshAsset, error: freshErr } = await supabase
        .from("investment_assets")
        .select("*")
        .eq("id", txData.asset_id)
        .single();
      if (freshErr) throw freshErr;

      // 6. Aplicar nova mutação no ativo.
      await applyAssetMutationForTx(freshAsset as InvestmentAsset, txData);

      // 7. Re-criar/linkar transação na conta corrente, se aplicável.
      if (createExpenseTransaction && accountId) {
        await createOrLinkTransactionForOp(id, txData, {
          accountId,
          categoryId,
          linkMode,
          existingTransactionId,
          assetTicker: (freshAsset as InvestmentAsset).ticker,
        });
      }

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_assets"] });
      queryClient.invalidateQueries({ queryKey: ["investment_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked_incomes"] });
      toast({ title: "Operação atualizada!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar operação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ============================================================
  // Delete transaction — reverte efeito no ativo + remove link.
  // ============================================================
  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error("Usuário não autenticado");

      const { data: oldTxRaw, error: fetchErr } = await supabase
        .from("investment_transactions")
        .select("*, asset:investment_assets(*)")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
      const oldTx = oldTxRaw as InvestmentTransaction & { asset: InvestmentAsset };

      if (oldTx.asset) {
        await reverseAssetMutationForTx(oldTx.asset, {
          type: oldTx.type,
          quantity: oldTx.quantity,
          unit_price: oldTx.unit_price,
          fees: oldTx.fees,
          total_value: oldTx.total_value,
        });
      }

      if (oldTx.linked_transaction_id) {
        await deleteOwnedLinkedTransaction(oldTx.linked_transaction_id, oldTx.type);
      }

      const { error: delErr } = await supabase
        .from("investment_transactions")
        .delete()
        .eq("id", id);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_assets"] });
      queryClient.invalidateQueries({ queryKey: ["investment_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
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
    name: assetTypeLabel(type),
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
    updateTransaction,
    deleteTransaction,
    updatePrices,
  };
}

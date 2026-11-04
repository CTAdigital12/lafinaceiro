import { supabase } from "@/integrations/supabase/client";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * O lançamento inteiro, como está no banco, para abrir no modal de edição.
 *
 * O `TransactionModal` grava o registro INTEIRO a partir do que recebe: conta,
 * cartão, status, vencimento, parcelamento, projeto. Abrir a edição com um
 * objeto parcial e salvar apaga tudo o que faltava nele. Quem só tem um resumo
 * do lançamento (descrição, valor, data) busca o registro real por aqui antes
 * de abrir o modal.
 */
export async function fetchTransactionById(id: string): Promise<Transaction> {
  const { data, error } = await supabase.from("transactions").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Transaction;
}

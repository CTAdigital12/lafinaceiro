import { supabase } from "@/integrations/supabase/client";
import { invoicePeriodFromDueDate } from "@/lib/dateUtils";

export const CLOSED_INVOICE_MESSAGE =
  "Esta fatura está fechada. Por segurança, você precisa reabri-la antes de modificar lançamentos.";

/** Só o que importa para localizar o ciclo de fatura de uma linha. */
export interface InvoiceScopedRow {
  credit_card_id?: string | null;
  due_date?: string | null;
}

/**
 * Verifica, numa única consulta, se alguma das linhas cai numa fatura fechada.
 *
 * Existe porque a trava de fatura fechada morava só dentro de `useTransactions`
 * (create/update/delete um a um). Toda escrita que não passava por lá —
 * operações em lote na tela de Transações, mutações de grupo de parcelas —
 * conseguia alterar uma fatura já fechada (auditoria A3).
 *
 * Retorna a mensagem de erro quando há bloqueio, ou `null` quando pode seguir.
 * Falha ABERTO (retorna null) se a consulta der erro: a trava é uma proteção
 * de conferência, não um controle de segurança, e derrubar a operação por
 * instabilidade de rede seria pior do que deixar passar.
 */
export async function findClosedInvoiceBlock(
  rows: InvoiceScopedRow[],
): Promise<string | null> {
  // (cardId, month, year) distintos que as linhas tocam.
  const periods = new Set<string>();
  const cardIds = new Set<string>();

  for (const row of rows) {
    if (!row.credit_card_id || !row.due_date) continue;
    const period = invoicePeriodFromDueDate(row.due_date);
    if (!period) continue;
    cardIds.add(row.credit_card_id);
    periods.add(`${row.credit_card_id}:${period.year}-${period.month}`);
  }

  if (cardIds.size === 0) return null;

  const { data, error } = await supabase
    .from("credit_card_invoices")
    .select("credit_card_id, month, year, status")
    .in("credit_card_id", Array.from(cardIds))
    .eq("status", "closed");

  if (error || !data) return null;

  const hit = data.some((invoice) =>
    periods.has(`${invoice.credit_card_id}:${invoice.year}-${invoice.month}`),
  );

  return hit ? CLOSED_INVOICE_MESSAGE : null;
}

/** Ids de cartão distintos tocados por um conjunto de linhas. */
export function affectedCardIds(rows: InvoiceScopedRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.credit_card_id) ids.add(row.credit_card_id);
  }
  return Array.from(ids);
}

import type { ImportedItem } from "./deduplication";
import {
  reconcileSpreadsheet,
  type SpreadsheetItem,
  type SystemRow,
  type SystemTransaction,
} from "./spreadsheetReconciliation";

/**
 * Lançamentos do ciclo que SOMAM na fatura e não estão na planilha que acabou
 * de ser importada.
 *
 * A deduplicação da importação reconhece o que já foi lançado pelo texto que o
 * banco manda — e o banco muda esse texto. Cada formato novo passou em
 * silêncio: lançamento à mão (#123, #125), nome de loja que cresce entre a
 * planilha parcial e a final (#129 na parcela, #132 à vista). Em nov/2026 o
 * Black ficou com 24 compras em dobro (R$ 4.606,21) sem aviso nenhum.
 *
 * Esta conferência não depende do texto: depois de gravar, o ciclo inteiro é
 * conciliado contra a mesma planilha (data + valor, como em Cartões ›
 * Conciliação de Faturas), e o que sobra do lado do sistema é mostrado. Pega
 * duplicata de qualquer origem — e também o que é legítimo sobrar, como compra
 * lançada à mão depois da data da planilha parcial. Por isso é aviso, nunca
 * exclusão automática.
 *
 * Só entra o que conta no total (`completed`, não provisório): parcela prevista
 * que o banco ainda não cobrou não infla a fatura e não é sobra. Pagamento de
 * fatura fica de fora já na consulta — não é conteúdo da fatura.
 */
export function invoiceLeftovers(
  fileItems: readonly ImportedItem[],
  cycle: readonly SystemTransaction[],
): SystemRow[] {
  const planilha: SpreadsheetItem[] = fileItems.map((item, rowIndex) => ({
    date: item.purchase_date ?? "",
    description: item.description ?? "",
    amount: Math.abs(item.transaction_value),
    isCredit: !!item.is_credit,
    rowIndex,
  }));

  const contamNaFatura = cycle.filter((tx) => tx.status === "completed" && !tx.is_provisional);

  return reconcileSpreadsheet(planilha, contamNaFatura, { matchCreditSign: true }).onlyInSystem;
}

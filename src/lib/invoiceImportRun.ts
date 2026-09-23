import { formatCurrency } from "@/lib/utils";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

/**
 * A gravação em massa da importação de fatura, com a ORIGEM de cada linha
 * presa ao lançamento.
 *
 * Antes disto o laço em `InvoiceReviewModal` só contava (`errorCount++`),
 * mandava o erro para o `console` e escrevia "N erros" no toast — e então
 * fechava o modal de qualquer jeito. O que falhou era irrecuperável pela
 * tela: a revisão inteira (categorias escolhidas à mão, marcação de empresa,
 * anotações, parcelas futuras) ia junto, e reimportar o arquivo obrigava a
 * refazer tudo, contando com a detecção de duplicata para não dobrar o que
 * já tinha entrado.
 *
 * Por isso o resultado devolve as linhas que falharam, não um número: é o que
 * permite mostrar QUAIS e repetir SÓ elas. Repetir só as que falharam também
 * é o que preserva o `installment_group_id` já sorteado — a linha guardada
 * aqui é a MESMA que será regravada, então uma parcela futura que falhou
 * volta para o grupo a que pertence, em vez de abrir um grupo novo.
 */

/** Um lançamento pronto para gravar, junto do rótulo que identifica a linha. */
export interface PreparedRow<T> {
  transaction: T;
  /** Como a pessoa reconhece a linha na tela de revisão. Ver `buildRowLabel`. */
  label: string;
}

export interface FailedRow<T> extends PreparedRow<T> {
  /** A mensagem do erro, preservada — é ela que diz o que houve. */
  message: string;
}

export interface ImportRunResult<T> {
  succeeded: number;
  failed: FailedRow<T>[];
}

/**
 * Grava as linhas em sequência e SEGUE depois de uma falha, para que uma linha
 * ruim não trave as boas. Nunca lança: o que deu errado volta em `failed`.
 *
 * `onProgress` é chamado a cada linha (inclusive nas que falham), para a barra
 * de progresso não congelar num erro.
 */
export async function runImportRows<T>(
  rows: readonly PreparedRow<T>[],
  create: (transaction: T) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportRunResult<T>> {
  let succeeded = 0;
  const failed: FailedRow<T>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await create(row.transaction);
      succeeded++;
    } catch (error) {
      failed.push({ ...row, message: mensagemDeErro(error) });
    }
    onProgress?.(i + 1, rows.length);
  }

  return { succeeded, failed };
}

/**
 * O rótulo de uma linha na lista de falhas.
 *
 * A data vai no formato em que o parser entrega (YYYY-MM-DD) DE PROPÓSITO: é
 * o mesmo texto que a linha exibe na tela de revisão, então os dois batem à
 * vista. A parcela entra no rótulo porque uma parcela futura carrega a data de
 * compra da linha original — sem ela, "3/10" e "4/10" ficariam idênticas.
 */
export function buildRowLabel(fields: {
  description: string;
  date: string;
  amount: number;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
}): string {
  const { description, date, amount, installmentNumber, totalInstallments } = fields;
  const installment =
    installmentNumber && totalInstallments
      ? ` (parcela ${installmentNumber}/${totalInstallments})`
      : "";

  return `${description}${installment} — ${date} — ${formatCurrency(amount)}`;
}

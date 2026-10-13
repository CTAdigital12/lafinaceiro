/**
 * Linha de fatura de cartão que é o PAGAMENTO da fatura anterior — não é
 * conteúdo desta fatura.
 *
 * O Itaú lista, na fatura de cada mês, o pagamento do mês anterior como
 * crédito: a de 10/2026 traz "Pagamento Efetuado 15/09 R$ 9.568,59", que é o
 * débito "FATURA PAGA PERSONNALITE" já lançado na conta e ligado ao cartão.
 * Nenhum leitor de planilha separava essa linha. Na conciliação ela caía em
 * "Apenas Banco" todo mês, já marcada como estorno, a um clique de "Incluir"
 * — que criaria R$ 9.568,59 de crédito falso e contaria o pagamento duas
 * vezes. Na importação da fatura entraria do mesmo jeito.
 *
 * Só para FATURA DE CARTÃO: o leitor da conciliação também serve à conta
 * bancária, onde "pagamento efetuado" pode ser um lançamento legítimo — por
 * isso a regra é aplicada por quem chama, não dentro do leitor.
 *
 * Exige CRÉDITO: compra cujo nome começa com "Pagamento" (débito) continua
 * sendo compra.
 */

const PREVIOUS_PAYMENT = /^(pagamento|pagto|pgto)\s+(efetuado|recebido|de fatura|fatura)\b/;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isPreviousInvoicePayment(line: { description: string; isCredit: boolean }): boolean {
  return line.isCredit && PREVIOUS_PAYMENT.test(normalize(line.description));
}

import { describe, it, expect } from "vitest";
import { parseInvoiceRows, parseCSVInvoice, convertToImportedItems } from "@/lib/csvInvoiceParser";

const opts = { invoiceMonth: 6, invoiceYear: 2026, closingDay: 3 };

describe("parseInvoiceRows — section-aware", () => {
  it("aplica o cartão do cabeçalho a todas as transações da seção", () => {
    const rows = [
      ["ANDRE EDUARDO SANTOS DOMIN - final 5391 (titular)"],
      ["data", "lançamento", "valor"],
      ["12/05/2026", "Mp *shellbox", "R$ 285,12"],
      ["14/05/2026", "Apple.com/bill", "R$ 93,90"],
    ];
    const result = parseInvoiceRows(rows, opts);
    expect(result).toHaveLength(2);
    expect(result.every(t => t.card_last_digits === "5391")).toBe(true);
    expect(result[0].description).toBe("Mp *shellbox");
    expect(result[0].amount).toBe(285.12);
  });

  it("troca o cartão a cada nova seção", () => {
    const rows = [
      ["ANDRE EDUARDO SANTOS DOMIN - final 5391 (titular)"],
      ["data", "lançamento", "valor"],
      ["12/05/2026", "Mp *shellbox", "R$ 285,12"],
      ["ANDRE EDUARDO SANTOS DOMIN - final 0993 (adicional)"],
      ["data", "lançamento", "valor"],
      ["06/10/2025", "Porta3acessorios 09/10", "R$ 310,07"],
      ["LUISA GUAREZI SILVESTRE - final 4420 (adicional)"],
      ["13/04/2026", "Ars Laboratorio 02/02", "R$ 147,50"],
    ];
    const result = parseInvoiceRows(rows, opts);
    expect(result.map(t => t.card_last_digits)).toEqual(["5391", "0993", "4420"]);
  });

  it("lê valores numéricos do Excel (ponto decimal, sem R$)", () => {
    // Como o XLS chega: data/descrição como string, valor como número -> "299.99".
    const rows = [
      ["ANDRE - final 5391 (titular)"],
      ["data", "lançamento", "", "valor"],
      ["16/07/2025", "Amazon Br 11/12", "", "299.99"],
      ["14/05/2026", "Apple.com/bill", "", "93.9"],
      ["20/05/2026", "Google Ads", "", "-0.02"],
    ];
    const result = parseInvoiceRows(rows, opts);
    expect(result).toHaveLength(3);
    // `amount` é sempre positivo; o sinal do arquivo vira `is_credit`.
    expect(result.map(t => t.amount)).toEqual([299.99, 93.9, 0.02]);
    expect(result.map(t => !!t.is_credit)).toEqual([false, false, true]);
    expect(result.every(t => t.card_last_digits === "5391")).toBe(true);
  });

  it("lê o valor mesmo afastado à direita (colunas vazias no meio)", () => {
    const rows = [
      ["ANDRE - final 5391 (titular)"],
      ["16/07/2025", "Amazon Br 11/12", "", "", "R$ 299,99"],
    ];
    const result = parseInvoiceRows(rows, opts);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(299.99);
    expect(result[0].description).toBe("Amazon Br 11/12");
    expect(result[0].card_last_digits).toBe("5391");
  });

  it("marca estorno/crédito em is_credit, com o valor em módulo", () => {
    // Contrato mudou: antes o valor negativo chegava negativo ao resto do app
    // e era gravado como despesa de valor negativo. Agora o sinal vira
    // `is_credit`, que o InvoiceReviewModal traduz para is_refund.
    const rows = [
      ["ANDRE - final 5391 (titular)"],
      ["20/05/2026", "Google Ads2070259911", "-R$ 0,02"],
    ];
    const result = parseInvoiceRows(rows, opts);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(0.02);
    expect(result[0].is_credit).toBe(true);
  });

  it("extrai parcela da descrição sem confundir com a data", () => {
    const rows = [
      ["ANDRE - final 5391 (titular)"],
      ["16/07/2025", "Amazon Br 11/12", "R$ 299,99"],
    ];
    const result = parseInvoiceRows(rows, opts);
    expect(result[0].installment_current).toBe(11);
    expect(result[0].installment_total).toBe(12);
    expect(result[0].date).toBe("2025-07-16");
  });

  it("ignora linhas em branco, sub-headers e linhas de total", () => {
    const rows = [
      ["ANDRE - final 5391 (titular)"],
      ["data", "lançamento", "valor"],
      ["", "", ""],
      ["12/05/2026", "Mp *shellbox", "R$ 285,12"],
      ["", "Total dos lançamentos", "R$ 285,12"],
    ];
    const result = parseInvoiceRows(rows, opts);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Mp *shellbox");
  });

  it("não confunde descrição contendo 'final 1234' com cabeçalho de seção", () => {
    const rows = [
      ["ANDRE - final 5391 (titular)"],
      ["12/05/2026", "Pagamento final 0001", "R$ 50,00"],
    ];
    const result = parseInvoiceRows(rows, opts);
    expect(result).toHaveLength(1);
    expect(result[0].card_last_digits).toBe("5391");
  });
});

describe("parseCSVInvoice — compatibilidade", () => {
  it("CSV legado sem seção: transações sem card_last_digits", () => {
    const csv = [
      "data;descrição;valor",
      "12/05/2026;Mp *shellbox;285,12",
      "14/05/2026;Apple.com/bill;93,90",
    ].join("\n");
    const result = parseCSVInvoice(csv, opts);
    expect(result).toHaveLength(2);
    expect(result[0].card_last_digits).toBeUndefined();
    expect(result[0].amount).toBe(285.12);
  });

  it("CSV com coluna de cartão explícita tem precedência", () => {
    const csv = [
      "data;descrição;valor;cartão",
      "12/05/2026;Mp *shellbox;285,12;•••• 1234",
    ].join("\n");
    const result = parseCSVInvoice(csv, opts);
    expect(result[0].card_last_digits).toBe("1234");
  });
});

/**
 * O arquivo da fatura traz a data da compra como "DD/MM", sem ano, e o parser
 * escolhe o ano. A regra antiga ("mês da compra > mês da fatura -> ano
 * passado") supunha que a compra tinha acontecido nos últimos 12 meses — o que
 * é verdade para compra avulsa e FALSO para parcela, que carrega a data da
 * compra original por todo o plano.
 *
 * Efeito medido antes da correção, com um cartão que fecha dia 20:
 *
 *   compra 06/10 em 13x  -> a parcela 13 vinha com 2026-10-06 (certo: 2025)
 *   compra 25/10 em 12x  -> a parcela 12 vinha com 2026-10-25 E marcada
 *                           pós-fechamento, o que a deixa DESMARCADA na
 *                           revisão: lançamento que não entra
 *   compra 25/10 em 24x  -> a parcela 24 errava por DOIS anos
 */
describe("data da compra — ano inferido de parcela antiga", () => {
  const FECHAMENTO = 20;

  /** Fatura (mês/ano) que cobra a parcela k, dada a fatura da primeira. */
  function faturaDaParcela(mesInicial: number, anoInicial: number, k: number) {
    const corridos = mesInicial - 1 + (k - 1);
    return { mes: (corridos % 12) + 1, ano: anoInicial + Math.floor(corridos / 12) };
  }

  /**
   * Passa a linha da parcela k pelo parser, na fatura em que ela realmente cai.
   * Compra depois do fechamento entra na fatura do mês seguinte.
   */
  function importarParcela(diaCompra: number, mesCompra: number, anoCompra: number, k: number, n: number) {
    let mesInicial = mesCompra + (diaCompra > FECHAMENTO ? 1 : 0);
    let anoInicial = anoCompra;
    if (mesInicial > 12) {
      mesInicial -= 12;
      anoInicial += 1;
    }

    const fatura = faturaDaParcela(mesInicial, anoInicial, k);
    const dia = String(diaCompra).padStart(2, "0");
    const mes = String(mesCompra).padStart(2, "0");
    const linha = `${dia}/${mes};LOJA TESTE ${k}/${n};100,00`;

    const parsed = parseCSVInvoice(linha, {
      invoiceMonth: fatura.mes,
      invoiceYear: fatura.ano,
      closingDay: FECHAMENTO,
    });
    const { items } = convertToImportedItems(parsed, fatura.mes, fatura.ano, FECHAMENTO);
    return items[0];
  }

  it.each([
    { n: 12, dia: 6, rotulo: "12x comprado antes do fechamento" },
    { n: 13, dia: 6, rotulo: "13x comprado antes do fechamento" },
    { n: 24, dia: 6, rotulo: "24x comprado antes do fechamento" },
    { n: 12, dia: 25, rotulo: "12x comprado depois do fechamento" },
    { n: 18, dia: 25, rotulo: "18x comprado depois do fechamento" },
    { n: 24, dia: 25, rotulo: "24x comprado depois do fechamento" },
  ])("$rotulo: toda parcela guarda a data da compra original", ({ n, dia }) => {
    const esperada = `2025-10-${String(dia).padStart(2, "0")}`;

    for (let k = 1; k <= n; k++) {
      const item = importarParcela(dia, 10, 2025, k, n);
      expect(`${k}/${n}: ${item.purchase_date}`).toBe(`${k}/${n}: ${esperada}`);
      // Parcela antiga não é compra pós-fechamento desta fatura.
      expect(`${k}/${n}: ${item.is_post_closing}`).toBe(`${k}/${n}: false`);
    }
  });

  it("compra avulsa do mês anterior continua caindo no ano certo", () => {
    // Fatura de janeiro/2026 com uma compra de 15/12: mês 12 > mês 1.
    const parsed = parseCSVInvoice("15/12;POSTO IPIRANGA;100,00", {
      invoiceMonth: 1,
      invoiceYear: 2026,
      closingDay: FECHAMENTO,
    });
    const { items } = convertToImportedItems(parsed, 1, 2026, FECHAMENTO);

    expect(items[0].purchase_date).toBe("2025-12-15");
  });

  it("compra avulsa depois do fechamento continua marcada como pós-fechamento", () => {
    // Guarda contra corrigir demais: o sinal existe e tem que continuar vindo.
    const parsed = parseCSVInvoice("25/10;POSTO IPIRANGA;100,00", {
      invoiceMonth: 10,
      invoiceYear: 2026,
      closingDay: FECHAMENTO,
    });
    const { items, post_closing_count } = convertToImportedItems(parsed, 10, 2026, FECHAMENTO);

    expect(items[0].purchase_date).toBe("2026-10-25");
    expect(items[0].is_post_closing).toBe(true);
    expect(post_closing_count).toBe(1);
  });

  it("respeita o ano quando o arquivo traz a data completa", () => {
    const parsed = parseCSVInvoice("06/10/2025;LOJA TESTE 13/13;100,00", {
      invoiceMonth: 10,
      invoiceYear: 2026,
      closingDay: FECHAMENTO,
    });

    expect(parsed[0].date).toBe("2025-10-06");
  });
});

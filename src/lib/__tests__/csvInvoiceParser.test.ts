import { describe, it, expect } from "vitest";
import { parseInvoiceRows, parseCSVInvoice } from "@/lib/csvInvoiceParser";

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

  it("preserva valores negativos (estornos/créditos)", () => {
    const rows = [
      ["ANDRE - final 5391 (titular)"],
      ["20/05/2026", "Google Ads2070259911", "-R$ 0,02"],
    ];
    const result = parseInvoiceRows(rows, opts);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(-0.02);
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

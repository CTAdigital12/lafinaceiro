import { describe, it, expect } from "vitest";
import { parseInvoiceRows, convertToImportedItems } from "@/lib/csvInvoiceParser";
import { detectDuplicates, type ExistingTransaction } from "@/lib/deduplication";
import { reconcileSpreadsheet, type SystemTransaction } from "@/lib/spreadsheetReconciliation";
import { invoiceDelta } from "@/lib/invoiceTotal";

const opts = { invoiceMonth: 8, invoiceYear: 2026, closingDay: 8 };

/**
 * Linhas reais da fatura Itaú de 08/2026 que motivaram a correção: o crédito de
 * ajuste de arredondamento vem logo abaixo da parcela, com descrição quase
 * igual e valor negativo. Os três somavam R$ 0,34 e nenhum chegava ao sistema.
 */
describe("crédito da fatura (valor negativo)", () => {
  it("guarda o sinal em is_credit e devolve o valor positivo", () => {
    const rows = [
      ["ANDRE EDUARDO SANTOS DOMIN - final 5391 (titular)"],
      ["data", "lançamento", "valor"],
      ["02/07/2026", "AMAZONMKTPLC*Amazo02/05", "100,05"],
      ["02/07/2026", "AMAZONMKTPLC*Amazon BR", "- 0,16"],
      ["04/07/2026", "AMAZON BR *Amazo02/04", "47,77"],
      ["04/07/2026", "AMAZON BR *Amazon BR", "-0,09"],
    ];

    const result = parseInvoiceRows(rows, opts);

    expect(result).toHaveLength(4);
    expect(result[1]).toMatchObject({ description: "AMAZONMKTPLC*Amazon BR", amount: 0.16, is_credit: true });
    expect(result[3]).toMatchObject({ description: "AMAZON BR *Amazon BR", amount: 0.09, is_credit: true });
    // Compra continua compra.
    expect(result[0].is_credit).toBeUndefined();
    expect(result[2].is_credit).toBeUndefined();
  });

  it("não confunde o crédito com uma parcela por causa do 02/05 na linha acima", () => {
    const rows = [
      ["data", "lançamento", "valor"],
      ["02/07/2026", "AMAZONMKTPLC*Amazon BR", "- 0,16"],
    ];
    const [tx] = parseInvoiceRows(rows, opts);
    expect(tx.installment_current).toBeUndefined();
    expect(tx.installment_total).toBeUndefined();
  });

  it("propaga is_credit para os itens da importação", () => {
    const rows = [
      ["data", "lançamento", "valor"],
      ["02/07/2026", "AMAZONMKTPLC*Amazon BR", "- 0,16"],
      ["02/07/2026", "AMAZONMKTPLC*Amazo02/05", "100,05"],
    ];
    const { items } = convertToImportedItems(parseInvoiceRows(rows, opts), 8, 2026, 8);

    expect(items[0]).toMatchObject({ transaction_value: 0.16, is_credit: true });
    expect(items[1].is_credit).toBeUndefined();
  });

  it("abate a fatura quando gravado na forma canônica de estorno", () => {
    // É assim que o InvoiceReviewModal grava um item com is_credit.
    expect(invoiceDelta({ amount: 0.16, type: "income", is_refund: true })).toBe(-0.16);
    // 100,05 − 0,16 = 99,89: o que o banco de fato cobrou pela parcela.
    expect(
      invoiceDelta({ amount: 100.05, type: "expense" }) +
        invoiceDelta({ amount: 0.16, type: "income", is_refund: true }),
    ).toBeCloseTo(99.89, 2);
  });
});

describe("detectDuplicates — sinal", () => {
  const base = {
    original_description: null,
    installment_number: null,
    total_installments: null,
  };

  it("não trata o crédito como duplicata da compra de mesmo valor no mesmo dia", () => {
    const existing: ExistingTransaction[] = [
      { ...base, id: "compra", description: "AJUSTE", amount: 0.16, date: "2026-07-02", is_refund: false },
    ];
    const dup = detectDuplicates(
      [{ transaction_value: 0.16, purchase_date: "2026-07-02", description: "AJUSTE", is_credit: true }],
      existing,
    );
    expect(dup.size).toBe(0);
  });

  it("reconhece o estorno já importado e não duplica na reimportação", () => {
    const existing: ExistingTransaction[] = [
      { ...base, id: "estorno", description: "AJUSTE", amount: 0.16, date: "2026-07-02", is_refund: true },
    ];
    const dup = detectDuplicates(
      [{ transaction_value: 0.16, purchase_date: "2026-07-02", description: "AJUSTE", is_credit: true }],
      existing,
    );
    expect(dup.get(0)?.id).toBe("estorno");
  });
});

describe("reconcileSpreadsheet — sinal", () => {
  const tx = (over: Partial<SystemTransaction>): SystemTransaction => ({
    id: "t1",
    date: "2026-07-02",
    due_date: "2026-08-15",
    description: "AJUSTE",
    original_description: null,
    amount: 0.16,
    is_refund: false,
    is_corporate_expense: false,
    category_id: null,
    status: "completed",
    ...over,
  });

  it("não casa crédito da planilha com despesa do sistema", () => {
    const result = reconcileSpreadsheet(
      [{ date: "2026-07-02", description: "AJUSTE", amount: 0.16, isCredit: true, rowIndex: 1 }],
      [tx({ is_refund: false })],
      { matchCreditSign: true },
    );
    expect(result.matched).toHaveLength(0);
    expect(result.valueDiscrepancies).toHaveLength(0);
    expect(result.onlyInSpreadsheet).toHaveLength(1);
    expect(result.onlyInSystem).toHaveLength(1);
  });

  it("sem matchCreditSign (extrato de conta) o sinal é ignorado, como antes", () => {
    // Em extrato de conta o negativo é débito comum. Se a regra de sinal
    // valesse aqui, toda despesa de um CSV deixaria de casar.
    const result = reconcileSpreadsheet(
      [{ date: "2026-07-02", description: "AJUSTE", amount: 0.16, isCredit: true, rowIndex: 1 }],
      [tx({ is_refund: false })],
    );
    expect(result.matched).toHaveLength(1);
  });

  it("casa crédito da planilha com estorno do sistema", () => {
    const result = reconcileSpreadsheet(
      [{ date: "2026-07-02", description: "AJUSTE", amount: 0.16, isCredit: true, rowIndex: 1 }],
      [tx({ is_refund: true })],
      { matchCreditSign: true },
    );
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInSystem).toHaveLength(0);
  });
});

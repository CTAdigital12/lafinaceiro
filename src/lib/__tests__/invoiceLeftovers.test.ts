import { describe, it, expect } from "vitest";
import { invoiceLeftovers } from "@/lib/invoiceLeftovers";
import type { SystemTransaction } from "@/lib/spreadsheetReconciliation";

/**
 * Conferência depois de importar a fatura: o que soma no ciclo e não está na
 * planilha. Os casos vêm da fatura de nov/2026 do Black, importada em parcial
 * (13/10, 21/10) e final (01/11), onde 24 compras ficaram em dobro.
 */

const tx = (over: Partial<SystemTransaction> & { id: string }): SystemTransaction => ({
  date: "2026-10-09",
  due_date: "2026-11-15",
  description: "Auto Posto Tacs",
  original_description: "Auto Posto Tacs",
  amount: 113.97,
  is_refund: false,
  is_corporate_expense: false,
  category_id: null,
  status: "completed",
  is_provisional: false,
  split_group_id: null,
  split_parent_id: null,
  ...over,
});

const FINAL = [
  { purchase_date: "2026-10-09", transaction_value: 113.97, description: "Auto Posto Tacs Maringa Bra" },
  { purchase_date: "2026-10-16", transaction_value: 96, description: "Cocamar Cianorte Bra" },
];

describe("invoiceLeftovers", () => {
  it("aponta a cópia em dobro, seja qual for o nome que o banco usou", () => {
    const ciclo = [
      tx({ id: "posto-parcial" }),
      tx({ id: "posto-final", description: "Auto Posto Tacs Maringa Bra", original_description: "Auto Posto Tacs Maringa Bra" }),
      tx({ id: "cocamar", date: "2026-10-16", amount: 96, description: "Cocamar - café", original_description: "Cocamar" }),
    ];

    const sobra = invoiceLeftovers(FINAL, ciclo);

    // Uma das duas cópias casa com a linha da planilha; a outra sobra.
    expect(sobra).toHaveLength(1);
    expect(["posto-parcial", "posto-final"]).toContain(sobra[0].id);
  });

  it("não aponta nada quando o ciclo bate com a planilha", () => {
    const ciclo = [
      tx({ id: "posto" }),
      tx({ id: "cocamar", date: "2026-10-16", amount: 96, description: "Cocamar", original_description: "Cocamar" }),
    ];

    expect(invoiceLeftovers(FINAL, ciclo)).toEqual([]);
  });

  it("aponta lançamento feito à mão que o banco não cobrou", () => {
    const ciclo = [
      tx({ id: "posto" }),
      tx({ id: "cocamar", date: "2026-10-16", amount: 96 }),
      tx({ id: "manual", date: "2026-10-30", amount: 142, description: "Recanto Do Djalma", original_description: null }),
    ];

    expect(invoiceLeftovers(FINAL, ciclo).map((r) => r.id)).toEqual(["manual"]);
  });

  it("ignora o que não soma na fatura: parcela prevista e lançamento provisório", () => {
    const ciclo = [
      tx({ id: "posto" }),
      tx({ id: "cocamar", date: "2026-10-16", amount: 96 }),
      tx({ id: "prevista", date: "2026-09-10", amount: 480.75, status: "pending" }),
      tx({ id: "provisoria", date: "2026-10-20", amount: 50, is_provisional: true }),
    ];

    expect(invoiceLeftovers(FINAL, ciclo)).toEqual([]);
  });

  it("estorno só casa com crédito da planilha, não com compra de mesmo valor", () => {
    const planilha = [{ purchase_date: "2026-10-22", transaction_value: 164.25, description: "Mercadolivre", is_credit: true }];
    const ciclo = [
      tx({ id: "compra", date: "2026-10-22", amount: 164.25 }),
      tx({ id: "estorno", date: "2026-10-22", amount: 164.25, is_refund: true }),
    ];

    expect(invoiceLeftovers(planilha, ciclo).map((r) => r.id)).toEqual(["compra"]);
  });

  it("lançamento dividido por categoria conta como a linha única da planilha", () => {
    const ciclo = [
      tx({ id: "posto-a", amount: 80, split_group_id: "g1" }),
      tx({ id: "posto-b", amount: 33.97, split_group_id: "g1", split_parent_id: "posto-a" }),
      tx({ id: "cocamar", date: "2026-10-16", amount: 96 }),
    ];

    expect(invoiceLeftovers(FINAL, ciclo)).toEqual([]);
  });
});

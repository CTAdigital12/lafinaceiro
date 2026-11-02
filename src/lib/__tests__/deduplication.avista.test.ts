import { describe, it, expect } from "vitest";
import { detectDuplicates, type ExistingTransaction } from "@/lib/deduplication";

/**
 * Dedup de compra à vista: o banco muda o nome da loja entre a planilha
 * parcial da fatura e a final, acrescentando cidade e país.
 *
 * A fatura de nov/2026 do Black foi importada em 13/10 e 21/10 (parcial) e em
 * 01/11 (final). As 24 compras que já estavam gravadas entraram de novo, porque
 * o ramo à vista exigia descrição idêntica: "Auto Posto Tacs" contra
 * "Auto Posto Tacs Maringa Bra".
 */

const compra = (over: Partial<ExistingTransaction> & { id: string }): ExistingTransaction => ({
  description: "Auto Posto Tacs",
  original_description: "Auto Posto Tacs",
  amount: 113.97,
  date: "2026-10-09",
  installment_number: null,
  total_installments: null,
  ...over,
});

describe("detectDuplicates — compra à vista", () => {
  it("reconhece a compra quando a fatura final acrescenta cidade ao nome da loja", () => {
    const existing = [
      compra({ id: "posto" }),
      // Descrição editada pelo usuário; a comparação usa a original do banco.
      compra({ id: "cocamar", description: "Cocamar - café", original_description: "Cocamar", amount: 96, date: "2026-10-16" }),
    ];

    const dup = detectDuplicates(
      [
        { transaction_value: 113.97, description: "Auto Posto Tacs Maringa Bra", purchase_date: "2026-10-09" },
        { transaction_value: 96, description: "Cocamar Cianorte Bra", purchase_date: "2026-10-16" },
      ],
      existing,
    );

    expect(dup.get(0)?.id).toBe("posto");
    expect(dup.get(1)?.id).toBe("cocamar");
  });

  it("não casa loja diferente de mesmo valor e mesma data", () => {
    const existing = [compra({ id: "posto" })];

    const dup = detectDuplicates(
      [{ transaction_value: 113.97, description: "Posto Abu Dhabi Maringa Bra", purchase_date: "2026-10-09" }],
      existing,
    );

    expect(dup.get(0)).toBeUndefined();
  });

  it("não casa a mesma loja em outra data", () => {
    const existing = [compra({ id: "posto" })];

    const dup = detectDuplicates(
      [{ transaction_value: 113.97, description: "Auto Posto Tacs Maringa Bra", purchase_date: "2026-10-10" }],
      existing,
    );

    expect(dup.get(0)).toBeUndefined();
  });

  it("descrição vazia não serve de prefixo para qualquer loja", () => {
    const existing = [compra({ id: "vazia", description: "", original_description: "" })];

    const dup = detectDuplicates(
      [{ transaction_value: 113.97, description: "Auto Posto Tacs Maringa Bra", purchase_date: "2026-10-09" }],
      existing,
    );

    expect(dup.get(0)).toBeUndefined();
  });
});

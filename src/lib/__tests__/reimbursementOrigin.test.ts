import { describe, it, expect } from "vitest";
import { isReimbursedOutsideInvoice } from "../reimbursementOrigin";

describe("isReimbursedOutsideInvoice", () => {
  it("PIX já lançado e vinculado: veio por fora", () => {
    expect(
      isReimbursedOutsideInvoice({
        reimbursement_status: "reimbursed",
        reimbursement_income_id: "pix-raizhe",
      }),
    ).toBe(true);
  });

  it("receita criada na conta (sem cartão): veio por fora", () => {
    expect(
      isReimbursedOutsideInvoice({
        reimbursement_status: "reimbursed",
        reimbursement_payment_id: "receita-criada",
        reimbursement_payment: { is_card_payment: false },
      }),
    ).toBe(true);
  });

  it("espelho na fatura (mark_reimbursed): abatida no cartão", () => {
    expect(
      isReimbursedOutsideInvoice({
        reimbursement_status: "reimbursed",
        reimbursement_payment_id: "espelho",
        reimbursement_payment: { is_card_payment: true },
      }),
    ).toBe(false);
  });

  it("vínculo cujo lançamento não veio na consulta: mantém o comportamento antigo", () => {
    expect(
      isReimbursedOutsideInvoice({
        reimbursement_status: "reimbursed",
        reimbursement_payment_id: "sumiu",
        reimbursement_payment: null,
      }),
    ).toBe(false);
  });

  it("reembolsada sem vínculo nenhum (dado legado): mantém o comportamento antigo", () => {
    expect(isReimbursedOutsideInvoice({ reimbursement_status: "reimbursed" })).toBe(false);
  });

  it("ainda pendente não é reembolsada por caminho nenhum", () => {
    expect(
      isReimbursedOutsideInvoice({
        reimbursement_status: "pending",
        reimbursement_income_id: "pix-raizhe",
      }),
    ).toBe(false);
  });
});

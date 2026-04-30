import { describe, it, expect } from "vitest";
import {
  isMonthlyExpense,
  isMonthlyExpenseRefund,
  isMonthlyIncome,
} from "@/lib/transactionFilters";

/**
 * Helper que cria uma transação base com o tipo dado e demais flags
 * em estado neutro (false / 'completed'), pra ficar fácil sobrescrever
 * só o atributo sob teste.
 */
const tx = (
  type: "expense" | "income",
  overrides: Partial<{
    is_corporate_expense: boolean | null;
    is_refund: boolean | null;
    is_reimbursable: boolean | null;
    is_card_payment: boolean | null;
    is_provisional: boolean | null;
    status: string | null;
  }> = {},
) => ({
  type,
  is_corporate_expense: false,
  is_refund: false,
  is_reimbursable: false,
  is_card_payment: false,
  is_provisional: false,
  status: "completed",
  ...overrides,
});

describe("isMonthlyExpense", () => {
  it("retorna true para expense comum, status='completed', sem flags", () => {
    expect(isMonthlyExpense(tx("expense"))).toBe(true);
  });

  it("retorna false se is_card_payment=true", () => {
    expect(isMonthlyExpense(tx("expense", { is_card_payment: true }))).toBe(false);
  });

  it("retorna false se is_corporate_expense=true", () => {
    expect(isMonthlyExpense(tx("expense", { is_corporate_expense: true }))).toBe(false);
  });

  it("retorna false se is_reimbursable=true", () => {
    expect(isMonthlyExpense(tx("expense", { is_reimbursable: true }))).toBe(false);
  });

  it("retorna false se is_refund=true", () => {
    expect(isMonthlyExpense(tx("expense", { is_refund: true }))).toBe(false);
  });

  it("retorna false se is_provisional=true", () => {
    expect(isMonthlyExpense(tx("expense", { is_provisional: true }))).toBe(false);
  });

  it("retorna false se status='pending'", () => {
    expect(isMonthlyExpense(tx("expense", { status: "pending" }))).toBe(false);
  });

  it("retorna true se status for diferente de 'pending' (ex: 'completed')", () => {
    expect(isMonthlyExpense(tx("expense", { status: "completed" }))).toBe(true);
  });

  it("retorna true se status for diferente de 'pending' (ex: 'failed')", () => {
    // Comportamento atual do helper: o único status excluído é 'pending'.
    expect(isMonthlyExpense(tx("expense", { status: "failed" }))).toBe(true);
  });

  it("retorna false se type='income'", () => {
    expect(isMonthlyExpense(tx("income"))).toBe(false);
  });
});

describe("isMonthlyIncome", () => {
  it("retorna true para income, completed, sem flags", () => {
    expect(isMonthlyIncome(tx("income"))).toBe(true);
  });

  it("retorna false para income com is_card_payment=true", () => {
    expect(isMonthlyIncome(tx("income", { is_card_payment: true }))).toBe(false);
  });

  it("retorna false para income com is_corporate_expense=true", () => {
    expect(isMonthlyIncome(tx("income", { is_corporate_expense: true }))).toBe(false);
  });

  it("retorna false para income com is_refund=true", () => {
    expect(isMonthlyIncome(tx("income", { is_refund: true }))).toBe(false);
  });

  it("retorna false para income com status='pending'", () => {
    expect(isMonthlyIncome(tx("income", { status: "pending" }))).toBe(false);
  });

  it("retorna false para expense", () => {
    expect(isMonthlyIncome(tx("expense"))).toBe(false);
  });
});

describe("isMonthlyExpenseRefund", () => {
  it("retorna true para expense + is_refund=true + status='completed'", () => {
    expect(isMonthlyExpenseRefund(tx("expense", { is_refund: true }))).toBe(true);
  });

  it("retorna false para expense + is_refund=true + is_corporate_expense=true", () => {
    expect(
      isMonthlyExpenseRefund(
        tx("expense", { is_refund: true, is_corporate_expense: true }),
      ),
    ).toBe(false);
  });

  it("retorna false para expense + is_refund=true + is_reimbursable=true", () => {
    expect(
      isMonthlyExpenseRefund(
        tx("expense", { is_refund: true, is_reimbursable: true }),
      ),
    ).toBe(false);
  });

  it("retorna false para expense + is_refund=true + is_provisional=true", () => {
    expect(
      isMonthlyExpenseRefund(
        tx("expense", { is_refund: true, is_provisional: true }),
      ),
    ).toBe(false);
  });

  it("retorna false para income + is_refund=true (refund de receita não conta)", () => {
    expect(isMonthlyExpenseRefund(tx("income", { is_refund: true }))).toBe(false);
  });

  it("retorna false para expense + is_refund=false", () => {
    expect(isMonthlyExpenseRefund(tx("expense", { is_refund: false }))).toBe(false);
  });
});

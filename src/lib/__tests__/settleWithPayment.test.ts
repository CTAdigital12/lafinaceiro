import { describe, it, expect } from "vitest";
import { canSettleWithPayment, settleRemaining } from "@/hooks/useSettleWithPayment";

const payment = {
  status: "completed",
  is_provisional: false,
  credit_card_id: null,
  is_card_payment: false,
  split_group_id: null,
  is_refund: false,
};

describe("canSettleWithPayment", () => {
  it("aceita o débito real de uma conta", () => {
    expect(canSettleWithPayment(payment)).toBe(true);
  });

  it("recusa o que a RPC também recusaria", () => {
    expect(canSettleWithPayment({ ...payment, status: "pending" })).toBe(false);
    expect(canSettleWithPayment({ ...payment, is_provisional: true })).toBe(false);
    expect(canSettleWithPayment({ ...payment, credit_card_id: "card-1" })).toBe(false);
    expect(canSettleWithPayment({ ...payment, is_card_payment: true })).toBe(false);
    expect(canSettleWithPayment({ ...payment, split_group_id: "group-1" })).toBe(false);
    expect(canSettleWithPayment({ ...payment, is_refund: true })).toBe(false);
  });

  it("trata os booleanos nulos do banco como falsos", () => {
    expect(
      canSettleWithPayment({
        ...payment,
        is_provisional: null,
        is_card_payment: null,
        is_refund: null,
      }),
    ).toBe(true);
  });
});

describe("settleRemaining", () => {
  it("fecha em zero quando a soma bate", () => {
    expect(settleRemaining(1611, [{ amount: 1500 }, { amount: 111 }])).toBe(0);
  });

  it("acusa o que falta e o que excede", () => {
    expect(settleRemaining(1611, [{ amount: 1500 }])).toBe(111);
    expect(settleRemaining(1611, [{ amount: 1500 }, { amount: 200 }])).toBe(-89);
  });

  it("não acumula erro de ponto flutuante", () => {
    expect(settleRemaining(0.3, [{ amount: 0.1 }, { amount: 0.2 }])).toBe(0);
  });

  it("sem seleção, falta o valor inteiro", () => {
    expect(settleRemaining(1611, [])).toBe(1611);
  });
});

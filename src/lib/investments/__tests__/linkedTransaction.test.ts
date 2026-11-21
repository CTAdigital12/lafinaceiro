import { describe, it, expect } from "vitest";
import { isAutoCreatedLinkedTransaction } from "@/lib/investments/linkedTransaction";

describe("isAutoCreatedLinkedTransaction — o que a operação pode apagar", () => {
  it("aplicação: só a despesa que o app criou", () => {
    expect(isAutoCreatedLinkedTransaction("buy", "Investimento: PIC")).toBe(true);
    // O débito do extrato vinculado à aplicação é do usuário: nunca apagar.
    expect(isAutoCreatedLinkedTransaction("buy", "CAP PIC 43 60")).toBe(false);
    expect(isAutoCreatedLinkedTransaction("buy", null)).toBe(false);
  });

  it("resgate: só a receita que o app criou", () => {
    expect(isAutoCreatedLinkedTransaction("sell", "Resgate: TREND CASH")).toBe(true);
    expect(isAutoCreatedLinkedTransaction("sell", "PIX TRANSF ANDRE")).toBe(false);
  });

  it("o prefixo de um tipo não vale para o outro", () => {
    expect(isAutoCreatedLinkedTransaction("buy", "Resgate: X")).toBe(false);
    expect(isAutoCreatedLinkedTransaction("sell", "Investimento: X")).toBe(false);
  });

  it("dividendo nunca cria lançamento", () => {
    expect(isAutoCreatedLinkedTransaction("dividend", "Investimento: X")).toBe(false);
  });
});

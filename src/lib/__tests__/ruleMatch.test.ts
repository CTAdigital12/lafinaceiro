import { describe, it, expect } from "vitest";
import { normalizeRuleText, ruleMatches } from "@/lib/ruleMatch";

describe("ruleMatches — regra de categorização casa com a descrição", () => {
  it("casa os dois formatos do extrato do Itaú para o mesmo débito", () => {
    expect(ruleMatches("CAP     PIC        40 60", "CAP PIC")).toBe(true);
    expect(ruleMatches("CAP PIC 41 60", "CAP PIC")).toBe(true);
  });

  it("ignora maiúsculas e espaços repetidos também na palavra-chave", () => {
    expect(ruleMatches("cap pic 41 60", "CAP   PIC")).toBe(true);
    expect(ruleMatches("UBER  TRIP", " uber trip ")).toBe(true);
  });

  it("não casa o que não contém a palavra-chave", () => {
    expect(ruleMatches("PICPAY TRANSF", "CAP PIC")).toBe(false);
    expect(ruleMatches("CAPITAL PICANHA", "CAP PIC")).toBe(false);
  });

  it("palavra-chave vazia não casa com tudo", () => {
    expect(ruleMatches("QUALQUER COISA", "   ")).toBe(false);
  });

  it("normaliza para maiúsculas com espaço simples", () => {
    expect(normalizeRuleText("  Cap\t PIC \n 41 ")).toBe("CAP PIC 41");
  });
});

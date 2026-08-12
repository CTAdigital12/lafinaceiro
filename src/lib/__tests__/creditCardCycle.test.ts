import { describe, it, expect } from "vitest";
import { calculateCardDueDate, type CardCycle } from "@/lib/creditCardCycle";

/** Cartão de referência: fecha dia 20, vence dia 5. */
const card: CardCycle = { closing_date: 20, due_date: 5 };

/** `Date` -> "yyyy-MM-dd" sem passar por fuso (getters são locais). */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

describe("calculateCardDueDate", () => {
  it("compra antes do fechamento cai na fatura do próprio mês", () => {
    expect(iso(calculateCardDueDate(new Date(2026, 7, 10), card))).toBe(
      "2026-08-05",
    );
  });

  it("compra depois do fechamento cai na fatura seguinte", () => {
    expect(iso(calculateCardDueDate(new Date(2026, 7, 25), card))).toBe(
      "2026-09-05",
    );
  });

  it("compra no dia exato do fechamento ainda entra na fatura do mês", () => {
    // A regra é "depois do fechamento" (>), não "no fechamento ou depois".
    expect(iso(calculateCardDueDate(new Date(2026, 7, 20), card))).toBe(
      "2026-08-05",
    );
  });

  it("vira o ano quando a compra passa do fechamento em dezembro", () => {
    expect(iso(calculateCardDueDate(new Date(2026, 11, 25), card))).toBe(
      "2027-01-05",
    );
  });

  describe("vencimento em dia que não existe no mês (A6)", () => {
    const dia31: CardCycle = { closing_date: 10, due_date: 31 };

    it("prende ao último dia de fevereiro em vez de transbordar para março", () => {
      // `new Date(2026, 1, 31)` devolveria 3 de março.
      expect(iso(calculateCardDueDate(new Date(2026, 1, 5), dia31))).toBe(
        "2026-02-28",
      );
    });

    it("respeita fevereiro de ano bissexto", () => {
      expect(iso(calculateCardDueDate(new Date(2028, 1, 5), dia31))).toBe(
        "2028-02-29",
      );
    });

    it("prende a 30 nos meses de 30 dias", () => {
      expect(iso(calculateCardDueDate(new Date(2026, 3, 5), dia31))).toBe(
        "2026-04-30",
      );
    });
  });

  describe("parcelas (monthsAhead)", () => {
    it("desloca uma fatura por parcela", () => {
      const compra = new Date(2026, 7, 25); // depois do fechamento -> setembro

      expect(iso(calculateCardDueDate(compra, card, 0))).toBe("2026-09-05");
      expect(iso(calculateCardDueDate(compra, card, 1))).toBe("2026-10-05");
      expect(iso(calculateCardDueDate(compra, card, 2))).toBe("2026-11-05");
    });

    it("vira o ano ao longo das parcelas", () => {
      const compra = new Date(2026, 10, 5); // antes do fechamento -> novembro

      expect(iso(calculateCardDueDate(compra, card, 1))).toBe("2026-12-05");
      expect(iso(calculateCardDueDate(compra, card, 2))).toBe("2027-01-05");
    });

    it("não propaga o clamp de um mês curto para os seguintes", () => {
      // Vencimento dia 31: fevereiro tem que prender em 28, mas março tem que
      // voltar para 31. Encadear a partir do vencimento anterior daria 28 em
      // todos os meses seguintes.
      const dia31: CardCycle = { closing_date: 10, due_date: 31 };
      const compra = new Date(2026, 0, 5); // antes do fechamento -> janeiro

      expect(iso(calculateCardDueDate(compra, dia31, 0))).toBe("2026-01-31");
      expect(iso(calculateCardDueDate(compra, dia31, 1))).toBe("2026-02-28");
      expect(iso(calculateCardDueDate(compra, dia31, 2))).toBe("2026-03-31");
    });
  });

  it("regressão A5: parcelada e avulsa no mesmo dia caem no mesmo vencimento", () => {
    // O defeito: o parcelamento usava "data da compra + N meses" e ignorava o
    // cartão, então a primeira parcela vencia 25/08 enquanto a compra avulsa
    // do mesmo dia vencia 05/09 — faturas diferentes para o mesmo dia.
    const compra = new Date(2026, 7, 25);

    const avulsa = calculateCardDueDate(compra, card);
    const primeiraParcela = calculateCardDueDate(compra, card, 0);

    expect(iso(primeiraParcela)).toBe(iso(avulsa));
    expect(iso(primeiraParcela)).not.toBe("2026-08-25"); // o valor antigo
  });
});

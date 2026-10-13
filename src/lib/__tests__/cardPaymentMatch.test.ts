import { describe, it, expect } from "vitest";
import { suggestCardForPayment } from "../cardPaymentMatch";

const PERSONNALITE = { id: "personnalite", name: "Itaú Personnalité Black" };
const UNICLASS = { id: "uniclass", name: "Itaú Uniclass Black" };
const NUBANK = { id: "nubank", name: "Nubank" };

describe("suggestCardForPayment", () => {
  // As três descrições reais do extrato Itaú.
  it("reconhece o nome truncado pelo banco", () => {
    expect(suggestCardForPayment("FATURA PAGA PERSONNALITE", [PERSONNALITE, NUBANK])).toBe("personnalite");
    expect(suggestCardForPayment("FATURA PAGA PERSON MULTI", [PERSONNALITE, NUBANK])).toBe("personnalite");
    expect(suggestCardForPayment("FATURA PAGA UNICLASS BLA", [PERSONNALITE, UNICLASS])).toBe("uniclass");
  });

  it("não joga o pagamento de um cartão não cadastrado no único que existe", () => {
    // "BLA" não conta (menos de 4 letras) — senão casaria com "Black".
    expect(suggestCardForPayment("FATURA PAGA UNICLASS BLA", [PERSONNALITE])).toBeNull();
  });

  it("não sugere quando mais de um cartão casa", () => {
    expect(
      suggestCardForPayment("PAG FATURA ITAU", [PERSONNALITE, UNICLASS]),
    ).toBeNull();
  });

  it("ignora o vocabulário de pagamento e acentos", () => {
    expect(suggestCardForPayment("PAGAMENTO FATURA CARTÃO", [PERSONNALITE, NUBANK])).toBeNull();
    expect(suggestCardForPayment("pag fatura nubank", [PERSONNALITE, NUBANK])).toBe("nubank");
  });

  it("sem cartões cadastrados, não sugere nada", () => {
    expect(suggestCardForPayment("FATURA PAGA PERSONNALITE", [])).toBeNull();
  });
});

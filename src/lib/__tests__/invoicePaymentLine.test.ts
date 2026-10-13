import { describe, it, expect } from "vitest";
import { isPreviousInvoicePayment } from "../invoicePaymentLine";

const credito = (description: string) => ({ description, isCredit: true });

describe("isPreviousInvoicePayment", () => {
  it("reconhece o pagamento da fatura anterior (a linha real do Itaú)", () => {
    expect(isPreviousInvoicePayment(credito("Pagamento Efetuado"))).toBe(true);
    expect(isPreviousInvoicePayment(credito("PAGAMENTO EFETUADO"))).toBe(true);
  });

  it("reconhece as variações comuns de outros emissores", () => {
    expect(isPreviousInvoicePayment(credito("Pagamento recebido"))).toBe(true);
    expect(isPreviousInvoicePayment(credito("PAGTO. EFETUADO"))).toBe(true);
    expect(isPreviousInvoicePayment(credito("Pagamento de fatura"))).toBe(true);
  });

  it("estorno de verdade continua sendo estorno", () => {
    expect(isPreviousInvoicePayment(credito("ESTORNO AMAZON MARKETPLACE"))).toBe(false);
    // O ajuste de arredondamento de parcelamento (achado do PR #66).
    expect(isPreviousInvoicePayment(credito("ALIEXPRESS 02/05"))).toBe(false);
  });

  it("compra (débito) com nome parecido continua sendo compra", () => {
    expect(isPreviousInvoicePayment({ description: "Pagamento Efetuado", isCredit: false })).toBe(false);
  });

  it("não confunde comerciante cujo nome só começa parecido", () => {
    expect(isPreviousInvoicePayment(credito("PAGSEGURO*LOJA"))).toBe(false);
    expect(isPreviousInvoicePayment(credito("PAG*JOSEDASILVA"))).toBe(false);
  });
});

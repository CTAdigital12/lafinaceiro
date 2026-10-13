import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * A importação da fatura por planilha não traz o pagamento da fatura anterior.
 *
 * O banco lista esse pagamento como crédito; importado, ele viraria estorno e
 * abateria a fatura pelo valor de um pagamento que já está lançado pelo
 * extrato da conta. A regra está em `invoicePaymentLine.test.ts`; aqui se
 * prova que a importação a aplica antes de entregar os itens à revisão.
 */

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/fileToRows", () => ({ fileToRows: () => Promise.resolve([]) }));
// O leitor da planilha é trocado; a conversão para itens de revisão é a real.
vi.mock("@/lib/csvInvoiceParser", async () => ({
  ...(await vi.importActual<typeof import("@/lib/csvInvoiceParser")>("@/lib/csvInvoiceParser")),
  parseInvoiceRows: () => [
    { date: "2026-09-20", description: "UBER TRIP", amount: 30 },
    { date: "2026-09-15", description: "Pagamento Efetuado", amount: 9568.59, is_credit: true },
    { date: "2026-09-22", description: "ESTORNO AMAZON", amount: 50, is_credit: true },
  ],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/DateContext", () => ({ useDate: () => ({ currentDate: new Date(2026, 9, 13) }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock("@/hooks/useFormatCurrency", () => ({
  useFormatCurrency: () => (value: number) => `R$ ${Number(value).toFixed(2)}`,
}));

import { InvoiceImportModal } from "../InvoiceImportModal";

describe("InvoiceImportModal — pagamento da fatura anterior", () => {
  it("deixa o pagamento de fora, avisa, e mantém o estorno de verdade", async () => {
    const onImportComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <InvoiceImportModal
        open
        onOpenChange={() => {}}
        creditCardId="personnalite"
        creditCardName="Itaú Personnalité Black"
        closingDate={5}
        onImportComplete={onImportComplete}
      />,
    );

    const input = document.body.querySelector("#invoice-file") as HTMLInputElement;
    await user.upload(
      input,
      new File(["x"], "fatura-outubro.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    await user.click(screen.getByRole("button", { name: /Processar Fatura/ }));

    await waitFor(() => expect(onImportComplete).toHaveBeenCalled());
    const descricoes = onImportComplete.mock.calls[0][0].items.map((i: { description: string }) => i.description);

    expect(descricoes).toContain("UBER TRIP");
    expect(descricoes).toContain("ESTORNO AMAZON");
    expect(descricoes).not.toContain("Pagamento Efetuado");

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Pagamento da fatura anterior deixado de fora" }),
    );
  });
});

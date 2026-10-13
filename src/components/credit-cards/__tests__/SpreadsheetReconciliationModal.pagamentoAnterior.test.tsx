import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * O pagamento da fatura anterior não pode ficar a um clique de virar estorno.
 *
 * A planilha de 10/2026 do Itaú traz "Pagamento Efetuado 15/09 R$ 9.568,59"
 * como crédito. A conciliação o mostrava em "Apenas Banco", já marcado como
 * estorno, com "Incluir" ao lado: um clique gravava R$ 9.568,59 de crédito na
 * fatura de outubro e o pagamento passava a contar duas vezes.
 */

const PLANILHA = vi.hoisted(() => [
  { date: "2026-09-20", description: "UBER TRIP", amount: 30, isCredit: false, rowIndex: 1 },
  { date: "2026-09-15", description: "Pagamento Efetuado", amount: 9568.59, isCredit: true, rowIndex: 2 },
]);

// O leitor de arquivo é trocado; a conciliação (reconcileSpreadsheet) é a real.
vi.mock("@/lib/spreadsheetReconciliation", async () => ({
  ...(await vi.importActual<typeof import("@/lib/spreadsheetReconciliation")>("@/lib/spreadsheetReconciliation")),
  parseSpreadsheetFile: () => Promise.resolve(PLANILHA),
}));

// A compra já está no sistema; o pagamento não aparece aqui (is_card_payment fica de fora).
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "or"]) chain[m] = () => chain;
  let eqs = 0;
  chain.eq = () => {
    eqs += 1;
    return eqs % 2 === 0
      ? Promise.resolve({
          data: [
            {
              id: "uber", date: "2026-09-20", due_date: "2026-10-15", description: "UBER TRIP",
              original_description: "UBER TRIP", amount: 30, is_refund: false, is_corporate_expense: false,
              category_id: null, status: "completed", split_group_id: null, split_parent_id: null,
            },
          ],
          error: null,
        })
      : chain;
  };
  return { supabase: { from: () => chain } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useFormatCurrency", () => ({
  useFormatCurrency: () => (value: number) => `R$ ${Number(value).toFixed(2)}`,
}));
vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({
    createTransaction: { mutateAsync: vi.fn() },
    deleteTransaction: { mutateAsync: vi.fn() },
    updateTransaction: { mutateAsync: vi.fn() },
  }),
}));

import { SpreadsheetReconciliationModal } from "../SpreadsheetReconciliationModal";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

describe("SpreadsheetReconciliationModal — pagamento da fatura anterior", () => {
  it("fica fora da conferência, à vista, e sem 'Incluir'", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <SpreadsheetReconciliationModal
          open
          onOpenChange={() => {}}
          creditCardId="personnalite"
          creditCardName="Itaú Personnalité Black"
          month={10}
          year={2026}
        />
      </QueryClientProvider>,
    );

    const input = document.body.querySelector('input[type="file"]') ?? container.querySelector('input[type="file"]');
    await user.upload(input as HTMLInputElement, new File(["x"], "fatura-outubro.xlsx"));

    expect(
      await screen.findByText(/1 pagamento da fatura anterior\s+fora da conferência/),
    ).toBeInTheDocument();
    expect(screen.getByText(/R\$ 9568\.59/)).toBeInTheDocument();

    // A compra concilia; nada sobra em "Apenas Banco" para incluir.
    expect(screen.getByText(/1 conciliados/)).toBeInTheDocument();
    expect(screen.queryByText(/apenas no banco/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Incluir/ })).not.toBeInTheDocument();
  });
});

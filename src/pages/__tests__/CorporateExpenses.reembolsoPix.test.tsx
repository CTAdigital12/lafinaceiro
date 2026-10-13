import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Baixa de despesa corporativa reembolsada por PIX.
 *
 * O caso real: três despesas no cartão (93,90 + 573,10 + 86,58) devolvidas
 * pela empresa num PIX único de 753,58, já lançado na conta. Antes, "Marcar
 * como Reembolsado" nesta tela chamava `mark_reimbursed` direto — o espelho
 * que abate a fatura, como se a empresa tivesse pago o cartão. Aqui se prova a
 * fiação da tela; o vínculo N-para-1 no banco está em
 * `supabase/tests/um_pix_varias_despesas.sql`.
 */

const markMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const settleMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const EXPENSES = vi.hoisted(() =>
  [
    ["apple", "Apple.com/bill", 93.9, "2026-08-14"],
    ["barbuto", "Il Barbuto - almoço WorkOn", 573.1, "2026-08-10"],
    ["santo-grao", "Santo Grao Patio Batel - Cafe", 86.58, "2026-08-10"],
  ].map(([id, description, amount, date]) => ({
    id,
    description,
    amount,
    date,
    due_date: "2026-09-15",
    credit_card_id: "itau",
    category_id: "raizhe",
    status: "completed",
    reimbursement_status: "pending",
    categories: { name: "Raizhe", icon: "💻", color: "#000" },
    credit_cards: { name: "Itaú Personnalité Black", last_digits: "5234" },
  })),
);

/** A cadeia do PostgREST que a página monta; todo elo devolve o mesmo objeto. */
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "or", "update"]) chain[m] = () => chain;
  chain.order = () => Promise.resolve({ data: EXPENSES, error: null });
  return { supabase: { from: () => chain } };
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useCreditCards", () => ({ useCreditCards: () => ({ creditCards: [] }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useFormatCurrency", () => ({
  useFormatCurrency: () => (value: number) => `R$ ${Number(value).toFixed(2)}`,
}));
vi.mock("@/hooks/useAccounts", () => ({ useAccounts: () => ({ accounts: [] }) }));
vi.mock("@/hooks/useReimbursementIncomeCandidates", () => ({
  useReimbursementIncomeCandidates: () => ({
    candidates: [
      {
        id: "pix-raizhe",
        account_id: "conta-itau",
        amount: 753.58,
        date: "2026-09-15",
        description: "PIX TRANSF RAIZHE 15 09",
        accounts: { name: "Itaú" },
      },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useReimbursementPayment", () => ({
  useReimbursementPayment: () => ({
    markAsReimbursed: { mutateAsync: markMock, isPending: false },
    unmarkAsReimbursed: { mutateAsync: vi.fn(), isPending: false },
    settleExternal: { mutateAsync: settleMock, isPending: false },
  }),
}));

import CorporateExpenses from "../CorporateExpenses";

// O <Select> do Radix abre por pointer events que o jsdom não implementa.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CorporateExpenses />
    </QueryClientProvider>,
  );

/** Seleciona as três e pede a baixa em lote, como na tela do usuário. */
async function marcarTodasComoReembolsadas(user: ReturnType<typeof userEvent.setup>) {
  renderPage();
  await screen.findAllByText("Apple.com/bill");
  // O primeiro checkbox é o "selecionar todos" do cabeçalho da tabela.
  await user.click(screen.getAllByRole("checkbox")[0]);
  await user.click(screen.getByRole("button", { name: /Marcar como Reembolsado/ }));
}

describe("Despesas Corporativas — reembolso recebido por PIX", () => {
  beforeEach(() => {
    markMock.mockClear();
    settleMock.mockClear();
  });

  it("pergunta a origem em vez de abater a fatura direto", async () => {
    const user = userEvent.setup();
    await marcarTodasComoReembolsadas(user);

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Como o reembolso chegou?")).toBeInTheDocument();
    expect(within(dialog).getByText(/3 despesas selecionadas/)).toBeInTheDocument();
    expect(markMock).not.toHaveBeenCalled();
  });

  it("um PIX só quita as três despesas, sem espelho na fatura", async () => {
    const user = userEvent.setup();
    await marcarTodasComoReembolsadas(user);

    await user.click(await screen.findByRole("button", { name: /PIX \/ transferência numa conta/ }));

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("3 despesas")).toBeInTheDocument();
    expect(within(modal).getByText("R$ 753.58")).toBeInTheDocument();

    await user.click(within(modal).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /PIX TRANSF RAIZHE 15 09/ }));
    // Valor do PIX bate com o total: nenhum aviso de divergência.
    expect(within(modal).queryByText(/é diferente do total/)).not.toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "Confirmar reembolso" }));

    await waitFor(() => expect(settleMock).toHaveBeenCalledTimes(1));
    expect(settleMock).toHaveBeenCalledWith({
      transactionIds: ["apple", "barbuto", "santo-grao"],
      incomeId: "pix-raizhe",
    });
    expect(markMock).not.toHaveBeenCalled();
  });

  it("crédito na fatura segue abatendo pelo espelho, uma a uma", async () => {
    const user = userEvent.setup();
    await marcarTodasComoReembolsadas(user);

    await user.click(await screen.findByRole("button", { name: /Crédito na fatura do cartão/ }));

    await waitFor(() => expect(markMock).toHaveBeenCalledTimes(3));
    expect(settleMock).not.toHaveBeenCalled();
  });
});

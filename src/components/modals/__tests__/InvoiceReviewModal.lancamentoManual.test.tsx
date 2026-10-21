import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Compra de cartão lançada à mão, depois confirmada pela fatura.
 *
 * Em 19/10/2026 "Recanto Do Djalma - Marmitas peões" (R$ 142,00) foi lançado à
 * mão no cartão. A fatura traz "RECANTO DO DJALMA", e a revisão o mostraria
 * como novo, marcado para entrar. A regra está em
 * `deduplication.invoiceManual.test.ts`; aqui se prova a fiação até o que é
 * gravado.
 */

const updates = vi.hoisted(() => [] as Array<{ patch: unknown; ids: string[] }>);
const createMock = vi.hoisted(() => vi.fn());
const findCategoryForDescription = vi.hoisted(() => () => null);
const findCorporateForDescription = vi.hoisted(() => () => false);
const emptyList = vi.hoisted(() => [] as unknown[]);

const EXISTENTES = vi.hoisted(() => [
  {
    id: "recanto", description: "Recanto Do Djalma - Marmitas peões", original_description: null, amount: 142,
    date: "2026-10-19", installment_number: null, total_installments: null, is_refund: false,
    split_group_id: null, split_parent_id: null, status: "completed", is_provisional: false,
  },
]);

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ expenseCategories: emptyList, createCategory: { mutateAsync: vi.fn(), isPending: false } }),
  groupCategoriesByParent: () => [],
}));
vi.mock("@/hooks/useCategorizationRules", () => ({
  useCategorizationRules: () => ({
    findCategoryForDescription,
    findCorporateForDescription,
    createRule: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  }),
}));
vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({ createTransaction: { mutateAsync: createMock } }),
}));
vi.mock("@/hooks/useCreditCardInvoiceSync", () => ({
  useCreditCardInvoiceSync: () => ({ syncInvoiceForCard: vi.fn().mockResolvedValue(undefined) }),
}));
// Hook trocado; a deduplicação é a REAL (a lib, não o módulo do hook).
vi.mock("@/hooks/useExistingInstallments", async () => ({
  useExistingInstallments: () => ({ data: EXISTENTES, isLoading: false }),
  detectDuplicates: (await import("@/lib/deduplication")).detectDuplicates,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/errorHandler", () => ({ logError: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => ({
        in: (_col: string, ids: string[]) => {
          updates.push({ patch, ids });
          return Object.assign(Promise.resolve({ error: null }), { eq: async () => ({ error: null }) });
        },
      }),
    }),
  },
}));

import { InvoiceReviewModal } from "../InvoiceReviewModal";

const IMPORT_DATA = {
  items: [
    { purchase_date: "2026-10-19", posting_date: "2026-10-20", due_date: "2026-11-15", transaction_value: 142, description: "RECANTO DO DJALMA" },
    { purchase_date: "2026-10-12", posting_date: "2026-10-13", due_date: "2026-11-15", transaction_value: 44.9, description: "NETFLIX.COM" },
  ],
  future_installments: [],
  post_closing_count: 0,
  invoice_month: 11,
  invoice_year: 2026,
  closing_day: 5,
  due_date: "2026-11-15",
  invoice_total: 186.9,
  calculated_total: 186.9,
  validation_warning: null,
};

beforeEach(() => {
  updates.length = 0;
  createMock.mockReset().mockResolvedValue(undefined);
});

const renderReview = () =>
  render(
    <TooltipProvider>
      <InvoiceReviewModal open onOpenChange={vi.fn()} importData={IMPORT_DATA} creditCardId="black" creditCardName="Itaú Black" />
    </TooltipProvider>,
  );

/** O cartão da linha "RECANTO DO DJALMA" na lista de revisão. */
const linhaDoRecanto = async () => {
  const card = (await screen.findByDisplayValue("RECANTO DO DJALMA")).closest(".transition-all");
  expect(card).not.toBeNull();
  return card as HTMLElement;
};

const descricoesGravadas = () => createMock.mock.calls.map(([tx]) => (tx as { original_description: string }).original_description);

describe("InvoiceReviewModal — lançamento feito à mão", () => {
  it("não grava de novo: vincula o manual à linha da fatura, com o texto e a data do banco", async () => {
    const user = userEvent.setup();
    renderReview();

    const card = await linhaDoRecanto();
    expect(within(card).getByText(/Lançado à mão:/)).toBeInTheDocument();
    expect(within(card).getByText(/Recanto Do Djalma - Marmitas peões/)).toBeInTheDocument();
    expect(within(card).getAllByRole("checkbox")[0]).not.toBeChecked();

    // Só a Netflix entra.
    await user.click(screen.getByRole("button", { name: /confirmar \(1\)/i }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      patch: { original_description: "RECANTO DO DJALMA", date: "2026-10-19" },
      ids: ["recanto"],
    });
    expect(descricoesGravadas()).toEqual(["NETFLIX.COM"]);
  });

  it("marcar a linha à mão grava a compra nova e não mexe no manual", async () => {
    const user = userEvent.setup();
    renderReview();

    await user.click(within(await linhaDoRecanto()).getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /confirmar \(2\)/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    expect(descricoesGravadas().sort()).toEqual(["NETFLIX.COM", "RECANTO DO DJALMA"]);
    expect(updates).toHaveLength(0);
  });

  it("restaurar depois de ignorar volta a ser lançado à mão, desmarcado — não 'Novo'", async () => {
    const user = userEvent.setup();
    renderReview();

    const card = await linhaDoRecanto();
    await user.click(within(card).getAllByRole("checkbox")[0]);
    await user.click(card.querySelector('[class*="lucide-trash"]')!.closest("button")!);
    await user.click(card.querySelector('[class*="lucide-rotate-ccw"]')!.closest("button")!);

    expect(within(card).getAllByRole("checkbox")[0]).not.toBeChecked();
    expect(within(card).getByText(/Lançado à mão:/)).toBeInTheDocument();
    expect(within(card).queryByText("Novo")).not.toBeInTheDocument();
  });
});

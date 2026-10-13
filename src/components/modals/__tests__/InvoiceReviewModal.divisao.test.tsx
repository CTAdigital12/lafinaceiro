import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Parcela prevista DIVIDIDA confirmada pela importação: todas as partes.
 *
 * A fatura traz "Airbnb 4/4 R$ 1.113,72"; o sistema tem a parcela prevista
 * dividida em 688,48 + 425,24. A deduplicação casa a soma — e a revisão
 * confirmava só a primária. A irmã ficava pendente, fora do total da fatura:
 * o ciclo 10/2026 do Itaú saiu 425,24 abaixo do banco com a conciliação em
 * 100% (ela soma as partes).
 */

const updates = vi.hoisted(() => [] as Array<{ patch: unknown; ids: string[] }>);
const findCategoryForDescription = vi.hoisted(() => () => null);
const findCorporateForDescription = vi.hoisted(() => () => false);
const emptyList = vi.hoisted(() => [] as unknown[]);

// A parcela 4/4 já prevista, dividida, as duas partes pendentes.
const EXISTENTES = vi.hoisted(() => [
  {
    id: "airbnb-4-primaria", description: "Airbnb 4/4", original_description: null, amount: 688.48,
    date: "2026-06-10", installment_number: 4, total_installments: 4, is_refund: false,
    split_group_id: "grupo-airbnb", split_parent_id: null,
  },
  {
    id: "airbnb-4-irma", description: "Airbnb 4/4 - parte do amigo", original_description: null, amount: 425.24,
    date: "2026-06-10", installment_number: 4, total_installments: 4, is_refund: false,
    split_group_id: "grupo-airbnb", split_parent_id: "airbnb-4-primaria",
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
  useTransactions: () => ({ createTransaction: { mutateAsync: vi.fn().mockResolvedValue(undefined) } }),
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
          return { eq: async () => ({ error: null }) };
        },
      }),
    }),
  },
}));

import { InvoiceReviewModal } from "../InvoiceReviewModal";

const IMPORT_DATA = {
  items: [
    {
      purchase_date: "2026-06-10", posting_date: "2026-09-23", due_date: "2026-10-15",
      transaction_value: 1113.72, description: "AIRBNB * HM", installment_current: 4, installment_total: 4,
    },
    { purchase_date: "2026-09-12", posting_date: "2026-09-23", due_date: "2026-10-15", transaction_value: 44.9, description: "NETFLIX.COM" },
  ],
  future_installments: [],
  post_closing_count: 0,
  invoice_month: 10,
  invoice_year: 2026,
  closing_day: 5,
  due_date: "2026-10-15",
  invoice_total: 1158.62,
  calculated_total: 1158.62,
  validation_warning: null,
};

describe("InvoiceReviewModal — parcela prevista dividida", () => {
  it("confirma as DUAS partes, não só a primária", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <InvoiceReviewModal open onOpenChange={vi.fn()} importData={IMPORT_DATA} creditCardId="personnalite" creditCardName="Itaú" />
      </TooltipProvider>,
    );

    // O Airbnb é duplicata (fica fora); só a Netflix entra como nova.
    await user.click(await screen.findByRole("button", { name: /confirmar \(1\)/i }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].patch).toEqual({ status: "completed" });
    expect([...updates[0].ids].sort()).toEqual(["airbnb-4-irma", "airbnb-4-primaria"]);
  });
});

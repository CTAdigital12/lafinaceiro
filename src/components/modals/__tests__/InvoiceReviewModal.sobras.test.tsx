import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Conferência depois de importar: o ciclo gravado contra a planilha.
 *
 * Em nov/2026 a fatura final do Black trouxe "Auto Posto Tacs Maringa Bra" e o
 * ciclo já tinha "Auto Posto Tacs", da planilha parcial. A deduplicação não
 * reconheceu, a compra entrou de novo e nada avisou. A regra da conferência
 * está em `invoiceLeftovers.test.ts`; aqui se prova a fiação: o modal fica
 * aberto mostrando a sobra, e sem o botão que gravaria tudo de novo.
 */

const createMock = vi.hoisted(() => vi.fn());
const onOpenChange = vi.hoisted(() => vi.fn());
const findCategoryForDescription = vi.hoisted(() => () => null);
const findCorporateForDescription = vi.hoisted(() => () => false);
const emptyList = vi.hoisted(() => [] as unknown[]);
const ciclo = vi.hoisted(() => ({ linhas: [] as unknown[] }));

const linha = vi.hoisted(() => (id: string, date: string, amount: number, description: string) => ({
  id, date, due_date: "2026-11-15", description, original_description: description, amount,
  is_refund: false, is_corporate_expense: false, category_id: null, status: "completed",
  is_provisional: false, split_group_id: null, split_parent_id: null,
}));

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
vi.mock("@/hooks/useExistingInstallments", async () => ({
  useExistingInstallments: () => ({ data: emptyList, isLoading: false }),
  detectDuplicates: (await import("@/lib/deduplication")).detectDuplicates,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/errorHandler", () => ({ logError: vi.fn() }));
// A consulta do ciclo, paginada: devolve a fatia pedida de `ciclo.linhas`.
vi.mock("@/integrations/supabase/client", () => {
  const consulta: Record<string, unknown> = {
    select: () => consulta,
    eq: () => consulta,
    or: () => consulta,
    order: () => consulta,
    range: async (from: number, to: number) => ({ data: ciclo.linhas.slice(from, to + 1), error: null }),
  };
  return { supabase: { from: () => consulta } };
});

import { InvoiceReviewModal } from "../InvoiceReviewModal";

const IMPORT_DATA = {
  items: [
    { purchase_date: "2026-10-09", posting_date: "2026-10-10", due_date: "2026-11-15", transaction_value: 113.97, description: "Auto Posto Tacs Maringa Bra" },
    { purchase_date: "2026-10-12", posting_date: "2026-10-13", due_date: "2026-11-15", transaction_value: 44.9, description: "NETFLIX.COM" },
  ],
  future_installments: [],
  post_closing_count: 0,
  invoice_month: 11,
  invoice_year: 2026,
  closing_day: 5,
  due_date: "2026-11-15",
  invoice_total: 158.87,
  calculated_total: 158.87,
  validation_warning: null,
};

beforeEach(() => {
  createMock.mockReset().mockResolvedValue(undefined);
  onOpenChange.mockReset();
});

const importar = async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <InvoiceReviewModal open onOpenChange={onOpenChange} importData={IMPORT_DATA} creditCardId="black" creditCardName="Itaú Black" />
    </TooltipProvider>,
  );
  await user.click(await screen.findByRole("button", { name: /confirmar \(2\)/i }));
  await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
};

describe("InvoiceReviewModal — conferência depois de importar", () => {
  it("mostra a compra em dobro e não oferece confirmar de novo", async () => {
    ciclo.linhas = [
      linha("posto-parcial", "2026-10-09", 113.97, "Auto Posto Tacs"),
      linha("posto-final", "2026-10-09", 113.97, "Auto Posto Tacs Maringa Bra"),
      linha("netflix", "2026-10-12", 44.9, "NETFLIX.COM"),
    ];

    await importar();

    expect(await screen.findByText("1 lançamento desta fatura não está na planilha")).toBeInTheDocument();
    expect(screen.getByText(/09\/10 · Auto Posto Tacs$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirmar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^fechar$/i })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("fecha como antes quando o ciclo bate com a planilha", async () => {
    ciclo.linhas = [
      linha("posto", "2026-10-09", 113.97, "Auto Posto Tacs Maringa Bra"),
      linha("netflix", "2026-10-12", 44.9, "NETFLIX.COM"),
    ];

    await importar();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByText(/não está na planilha|não estão na planilha/)).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * O que a tela faz quando a gravação de uma linha da fatura é recusada.
 *
 * A regra pura (seguir depois do erro, devolver qual linha falhou) está em
 * `invoiceImportRun.test.ts`. Aqui se prova o que só a tela pode errar: antes
 * disto o modal contava os erros, escrevia "N erros" no toast e FECHAVA
 * assim mesmo — a revisão inteira (categorias, marcação de empresa,
 * anotações) ia junto e não havia como regravar só o que faltou.
 */

const createTransaction = vi.hoisted(() => vi.fn());
const syncInvoiceForCard = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const toast = vi.hoisted(() => vi.fn());

// Identidades ESTÁVEIS: estas funções são dependência do efeito que monta a
// lista de revisão. Recriá-las a cada render faria o efeito rodar sem parar.
const findCategoryForDescription = vi.hoisted(() => () => null);
const findCorporateForDescription = vi.hoisted(() => () => false);
const emptyList = vi.hoisted(() => [] as unknown[]);

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    expenseCategories: emptyList,
    createCategory: { mutateAsync: vi.fn(), isPending: false },
  }),
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
  useTransactions: () => ({ createTransaction: { mutateAsync: createTransaction } }),
}));

vi.mock("@/hooks/useCreditCardInvoiceSync", () => ({
  useCreditCardInvoiceSync: () => ({ syncInvoiceForCard }),
}));

vi.mock("@/hooks/useExistingInstallments", () => ({
  useExistingInstallments: () => ({ data: emptyList, isLoading: false }),
  detectDuplicates: () => new Map(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/lib/errorHandler", () => ({ logError: vi.fn() }));

// O módulo real exige as variáveis de ambiente do Supabase, que o CI não tem.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({ in: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  },
}));

import { InvoiceReviewModal } from "../InvoiceReviewModal";

const item = (description: string, transaction_value: number) => ({
  purchase_date: "2026-09-12",
  posting_date: "2026-09-23",
  due_date: "2026-10-05",
  transaction_value,
  description,
});

const IMPORT_DATA = {
  items: [item("NETFLIX.COM", 44.9), item("SHOPEE", 100)],
  future_installments: [],
  post_closing_count: 0,
  invoice_month: 9,
  invoice_year: 2026,
  closing_day: 25,
  due_date: "2026-10-05",
  invoice_total: 144.9,
  calculated_total: 144.9,
  validation_warning: null,
};

const renderModal = (onOpenChange = vi.fn()) => {
  render(
    <TooltipProvider>
      <InvoiceReviewModal
        open
        onOpenChange={onOpenChange}
        importData={IMPORT_DATA}
        creditCardId="cartao-1"
        creditCardName="Itaú"
      />
    </TooltipProvider>,
  );
  return onOpenChange;
};

/** Recusa só a linha da SHOPEE; a outra grava normalmente. */
const recusaShopee = (mensagem: string) =>
  createTransaction.mockImplementation(async (t: { description: string }) => {
    if (t.description.includes("SHOPEE")) throw new Error(mensagem);
  });

describe("InvoiceReviewModal — linhas que a gravação recusou", () => {
  beforeEach(() => {
    createTransaction.mockReset();
    syncInvoiceForCard.mockClear();
    toast.mockClear();
  });

  it("mantém o modal aberto e diz QUAL linha falhou e por quê", async () => {
    const user = userEvent.setup();
    recusaShopee("new row violates row-level security policy");
    const onOpenChange = renderModal();

    await user.click(await screen.findByRole("button", { name: /confirmar \(2\)/i }));

    expect(await screen.findByText(/1 lançamento não foi gravado/i)).toBeInTheDocument();
    // A linha é identificada como aparece na revisão, não por um número de
    // ordem que a tela não mostra.
    expect(screen.getByText(/SHOPEE .* 2026-09-12 .* 100,00/)).toBeInTheDocument();
    expect(
      screen.getByText("new row violates row-level security policy"),
    ).toBeInTheDocument();

    // O ponto: fechar aqui jogaria fora a revisão inteira.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("a que deu certo entra, e a fatura é recalculada mesmo com erro", async () => {
    const user = userEvent.setup();
    recusaShopee("falhou");
    renderModal();

    await user.click(await screen.findByRole("button", { name: /confirmar \(2\)/i }));
    await screen.findByText(/1 lançamento não foi gravado/i);

    expect(createTransaction).toHaveBeenCalledTimes(2);
    expect(syncInvoiceForCard).toHaveBeenCalledWith("cartao-1");
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Fatura importada com erros",
        description: expect.stringContaining("1 não gravadas"),
      }),
    );
  });

  // Sem isto, o caminho de saída seria confirmar a fatura de novo — que
  // regravaria também a linha que JÁ entrou, duplicando-a.
  it("o botão principal vira retentativa e regrava só a linha que faltou", async () => {
    const user = userEvent.setup();
    recusaShopee("falhou");
    const onOpenChange = renderModal();

    await user.click(await screen.findByRole("button", { name: /confirmar \(2\)/i }));
    await screen.findByText(/1 lançamento não foi gravado/i);

    expect(screen.queryByRole("button", { name: /confirmar/i })).not.toBeInTheDocument();

    createTransaction.mockReset();
    createTransaction.mockResolvedValue(undefined);

    await user.click(screen.getByRole("button", { name: /tentar novamente \(1\)/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(createTransaction).toHaveBeenCalledTimes(1);
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ description: "SHOPEE" }),
    );
  });

  it("uma retentativa que falha de novo mantém a linha na lista", async () => {
    const user = userEvent.setup();
    recusaShopee("falhou");
    const onOpenChange = renderModal();

    await user.click(await screen.findByRole("button", { name: /confirmar \(2\)/i }));
    await screen.findByText(/1 lançamento não foi gravado/i);

    recusaShopee("continua falhando");
    await user.click(screen.getByRole("button", { name: /tentar novamente \(1\)/i }));

    expect(await screen.findByText("continua falhando")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar novamente \(1\)/i })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("sem nenhuma falha o modal fecha, como antes", async () => {
    const user = userEvent.setup();
    createTransaction.mockResolvedValue(undefined);
    const onOpenChange = renderModal();

    await user.click(await screen.findByRole("button", { name: /confirmar \(2\)/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByText(/não foi gravado/i)).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Fatura importada com sucesso!" }),
    );
  });
});

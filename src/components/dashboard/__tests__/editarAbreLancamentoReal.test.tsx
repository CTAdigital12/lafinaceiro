import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrivacyProvider } from "@/contexts/PrivacyContext";

/**
 * Editar a partir do detalhe de categoria do Dashboard abre o lançamento REAL.
 *
 * As duas telas montavam um Transaction sintético com conta, cartão, status,
 * vencimento e parcelamento vazios, e o TransactionModal grava o registro
 * inteiro a partir do que recebe. Em 01/11/2026 o PIX de R$ 4.250 da Luisa
 * ganhou categoria por "Receitas por Categoria" e perdeu a conta: o saldo do
 * Itaú ficou R$ 4.250 abaixo do banco.
 */

const REAL = vi.hoisted(() => ({
  id: "luisa",
  description: "PIX TRANSF LUISA G21 10",
  amount: 4250,
  date: "2026-10-21",
  type: "income",
  category_id: null,
  account_id: "itau",
  credit_card_id: null,
  status: "completed",
  installment_group_id: null,
  due_date: null,
}));

const recebido = vi.hoisted(() => ({ transaction: undefined as unknown }));

vi.mock("@/integrations/supabase/client", () => {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    single: async () => ({ data: REAL, error: null }),
  };
  return { supabase: { from: () => consulta } };
});
vi.mock("@/components/modals/TransactionModal", () => ({
  TransactionModal: (props: { open: boolean; transaction: unknown }) => {
    if (props.open) recebido.transaction = props.transaction;
    return null;
  },
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/errorHandler", () => ({ logError: vi.fn() }));

import { CategoryDetailSheet } from "../CategoryDetailSheet";
import { ParentCategoryDetailSheet } from "../ParentCategoryDetailSheet";

// O que a tela recebe é só o resumo — sem conta, cartão nem status.
const RESUMO = { id: "luisa", description: "PIX TRANSF LUISA G21 10", amount: 4250, date: "2026-10-21", type: "income" };

beforeEach(() => {
  recebido.transaction = undefined;
});

describe("detalhe de categoria do Dashboard — editar", () => {
  it("CategoryDetailSheet abre o modal com o registro real, com a conta", async () => {
    render(
      <PrivacyProvider>
      <CategoryDetailSheet
        open
        onOpenChange={vi.fn()}
        categoryName="Sem categoria"
        categoryColor="#999"
        totalAmount={4250}
        transactions={[RESUMO]}
      />
      </PrivacyProvider>,
    );

    await userEvent.click(await screen.findByText("PIX TRANSF LUISA G21 10"));

    await waitFor(() => expect(recebido.transaction).toBeDefined());
    expect(recebido.transaction).toMatchObject({ id: "luisa", account_id: "itau", status: "completed" });
  });

  it("ParentCategoryDetailSheet abre o modal com o registro real, com a conta", async () => {
    render(
      <PrivacyProvider>
      <ParentCategoryDetailSheet
        open
        onOpenChange={vi.fn()}
        parentCategory={{ id: "renda", name: "Renda", value: 4250, color: "#999" }}
        subcategories={[]}
        directTransactions={[RESUMO]}
        allParentCategories={[]}
        onParentCategoryChange={vi.fn()}
        categoryType="income"
      />
      </PrivacyProvider>,
    );

    // Os lançamentos diretos ficam no grupo recolhido "Outros (Renda)".
    await userEvent.click(await screen.findByText("Outros (Renda)"));
    await userEvent.click(await screen.findByText("PIX TRANSF LUISA G21 10"));

    await waitFor(() => expect(recebido.transaction).toBeDefined());
    expect(recebido.transaction).toMatchObject({ id: "luisa", account_id: "itau", status: "completed" });
  });
});

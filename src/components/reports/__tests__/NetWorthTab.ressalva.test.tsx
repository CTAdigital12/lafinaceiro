import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * A evolução patrimonial é RECONSTRUÍDA, não medida — e a tela apresentava o
 * resultado como fato. O achado M15 da auditoria: procurando por
 * "aproxima/estimativa/reconstru" na UI, zero ocorrências.
 *
 * Este teste guarda a ressalva. Ela é texto, então some sem quebrar nada: é
 * exatamente o tipo de coisa que uma edição futura apaga sem perceber.
 */

vi.mock("@/hooks/useAccounts", () => ({ useAccounts: () => ({ totalBalance: 10000 }) }));
vi.mock("@/hooks/useInvestments", () => ({ useInvestments: () => ({ totalPatrimony: 5000 }) }));
vi.mock("@/hooks/useCreditCards", () => ({ useCreditCards: () => ({ totalInvoice: 2000 }) }));
vi.mock("@/hooks/usePendingInstallments", () => ({
  usePendingInstallments: () => ({ summary: { totalAmount: 500 } }),
}));
vi.mock("@/hooks/useFormatCurrency", () => ({
  useFormatCurrency: () => (v: number) => `R$ ${Number(v).toFixed(2)}`,
}));

const transacoes = vi.hoisted(() => [
  {
    id: "t1",
    type: "income",
    amount: 3000,
    date: "2026-09-05",
    due_date: null,
    credit_card_id: null,
    status: "completed",
    is_refund: false,
    is_card_payment: false,
    is_reimbursable: false,
    is_corporate_expense: false,
    is_provisional: false,
  },
]);

vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({ transactions: transacoes, isLoading: false }),
}));

import { NetWorthTab } from "../NetWorthTab";

describe("NetWorthTab — ressalva da evolução patrimonial", () => {
  it("diz na tela que só o valor de hoje é medido", () => {
    render(<NetWorthTab />);

    expect(screen.getByText(/Só o valor de hoje é medido/i)).toBeInTheDocument();
  });

  it("avisa que investimentos, faturas e parcelas entram pelo valor de hoje", () => {
    render(<NetWorthTab />);

    // É o que a reconstrução deixa de fora: ela anda só com o fluxo de caixa,
    // então variação de preço e mudança de fatura nunca aparecem no passado.
    expect(
      screen.getByText(/Investimentos, faturas e parcelas\s+futuras entram pelo valor de/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/não\s+aparece no passado/i)).toBeInTheDocument();
  });

  it("o título do gráfico não anuncia a série como fato", () => {
    render(<NetWorthTab />);

    expect(screen.getByText(/Evolução Patrimonial estimada \(12 meses\)/i)).toBeInTheDocument();
    expect(screen.queryByText("Evolução Patrimonial (12 meses)")).not.toBeInTheDocument();
  });

  // O valor de HOJE é medido de verdade: ativos − passivos, sem reconstrução.
  // A ressalva fala do gráfico e não pode contaminar este número.
  it("o patrimônio de hoje continua sendo mostrado sem ressalva", () => {
    render(<NetWorthTab />);

    expect(screen.getByText("Patrimônio Líquido")).toBeInTheDocument();
    expect(screen.getByText("R$ 12500.00")).toBeInTheDocument();
  });
});

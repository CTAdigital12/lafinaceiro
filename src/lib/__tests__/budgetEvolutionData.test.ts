import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A linha "Gasto" do gráfico de evolução do Planejamento tem que ser o mesmo
 * número do card "Total Gasto", mês a mês, e ler o ano inteiro — que passa
 * das 1000 linhas em que o PostgREST corta sem avisar.
 *
 * O mock imita o PostgREST: sem `.range()` devolve as primeiras 1000 linhas;
 * com `.range()` devolve a fatia pedida, também limitada a 1000.
 */
const TETO = 1000;

const banco = vi.hoisted(() => ({ linhas: [] as Record<string, unknown>[] }));

vi.mock("@/integrations/supabase/client", () => {
  const consulta = () => {
    let intervalo: [number, number] | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      or: () => q,
      order: () => q,
      range: (from: number, to: number) => {
        intervalo = [from, to];
        return q;
      },
      then: (resolve: (r: unknown) => unknown) => {
        const [from, to] = intervalo ?? [0, banco.linhas.length - 1];
        const fim = Math.min(to + 1, from + TETO);
        return Promise.resolve({ data: banco.linhas.slice(from, fim), error: null }).then(resolve);
      },
    };
    return q;
  };
  return { supabase: { from: () => consulta() } };
});

import { fetchBudgetSpentByMonth } from "@/lib/budgetEvolutionData";

const linha = (over: Record<string, unknown>) => ({
  amount: 0,
  type: "expense",
  date: "2026-01-01",
  due_date: null,
  credit_card_id: null,
  status: "completed",
  is_corporate_expense: false,
  is_refund: false,
  is_reimbursable: false,
  is_reimbursement: false,
  is_card_payment: false,
  is_provisional: false,
  ...over,
});

const JAN = 0;
const FEV = 1;
const NOV = 10;

beforeEach(() => {
  banco.linhas = [];
});

describe("fetchBudgetSpentByMonth", () => {
  it("lê o ano inteiro, inclusive o que passa do teto do PostgREST", async () => {
    // Na ordem de `id`: 1000 despesas de R$ 10 em novembro e, depois do corte,
    // 100 de R$ 100 em janeiro.
    for (let i = 0; i < 1100; i++) {
      const janeiro = i >= 1000;
      banco.linhas.push(
        linha({ amount: janeiro ? 100 : 10, date: janeiro ? "2026-01-15" : "2026-11-05" }),
      );
    }

    const gasto = await fetchBudgetSpentByMonth(2026);

    expect(gasto).toHaveLength(12);
    expect(gasto[NOV]).toBe(10_000);
    // Truncado em 1000 linhas, janeiro sairia zerado.
    expect(gasto[JAN]).toBe(10_000);
  });

  it("soma como o card Total Gasto: competência, estorno abate, fatura não conta", async () => {
    banco.linhas = [
      linha({ amount: 500, date: "2026-01-10" }),
      // Compra no cartão em janeiro com vencimento em fevereiro: é de fevereiro.
      linha({ amount: 200, date: "2026-01-25", due_date: "2026-02-10", credit_card_id: "c1" }),
      // Estorno de cartão gravado como receita abate o mês do vencimento.
      linha({ amount: 50, type: "income", is_refund: true, date: "2026-01-28", due_date: "2026-02-10", credit_card_id: "c1" }),
      // Pagamento da fatura: transferência interna, não é gasto.
      linha({ amount: 700, date: "2026-01-12", is_card_payment: true }),
      // Prevista consome orçamento.
      linha({ amount: 80, date: "2026-01-20", status: "pending" }),
      linha({ amount: 300, date: "2026-01-05", is_corporate_expense: true }),
      linha({ amount: 9000, type: "income", date: "2026-01-05" }),
    ];

    const gasto = await fetchBudgetSpentByMonth(2026);

    expect(gasto[JAN]).toBe(580); // 500 + 80 prevista
    expect(gasto[FEV]).toBe(150); // 200 − 50
  });
});

import { describe, it, expect, vi } from "vitest";

/**
 * O "Balanço Mensal" busca 6 meses de lançamentos de uma vez. O PostgREST
 * corta a resposta em 1000 linhas sem avisar; passando disso, os lançamentos
 * que ficassem fora do corte sumiriam das barras sem erro.
 *
 * O mock imita o PostgREST: sem `.range()` devolve as primeiras 1000 linhas;
 * com `.range()` devolve a fatia pedida, também limitada a 1000.
 */
const TETO = 1000;

const LINHAS = vi.hoisted(() => {
  const base = {
    type: "income",
    due_date: null,
    credit_card_id: null,
    status: "completed",
    is_corporate_expense: false,
    is_refund: false,
    is_reimbursable: false,
    is_reimbursement: false,
    is_card_payment: false,
    is_provisional: false,
  };
  const linhas = [];
  // Na ordem de `id`: 1000 receitas de R$ 10 em novembro e, depois do corte,
  // 100 receitas de R$ 100 em junho.
  for (let i = 0; i < 1100; i++) {
    const junho = i >= 1000;
    linhas.push({
      ...base,
      id: `t${String(i).padStart(4, "0")}`,
      amount: junho ? 100 : 10,
      date: junho ? "2026-06-15" : "2026-11-05",
    });
  }
  return linhas;
});

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
        const [from, to] = intervalo ?? [0, LINHAS.length - 1];
        const fim = Math.min(to + 1, from + TETO);
        return Promise.resolve({ data: LINHAS.slice(from, fim), error: null }).then(resolve);
      },
    };
    return q;
  };
  return { supabase: { from: () => consulta() } };
});

import { fetchBalanceChartData } from "@/lib/balanceChartData";

describe("fetchBalanceChartData — período com mais de 1000 lançamentos", () => {
  it("soma também o que passa do teto do PostgREST", async () => {
    const meses = await fetchBalanceChartData(2026, 11);

    expect(meses.map((m) => m.month)).toEqual(["Jun", "Jul", "Ago", "Set", "Out", "Nov"]);
    expect(meses[5].receitas).toBe(10_000);
    // Truncado em 1000 linhas, junho sairia zerado.
    expect(meses[0].receitas).toBe(10_000);
  });
});

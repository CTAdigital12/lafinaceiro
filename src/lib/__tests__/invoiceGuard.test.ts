import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A trava de fatura fechada é o mecanismo compartilhado do A3: toda escrita que
 * não passa por `useTransactions` (operações em lote, mutações de grupo de
 * parcelas) consulta esta função antes de gravar.
 */
const respostaConsulta = vi.hoisted(() => ({
  valor: { data: [] as unknown[] | null, error: null as unknown },
}));

const consultasFeitas = vi.hoisted(() => [] as Array<unknown[]>);

vi.mock("@/integrations/supabase/client", () => {
  const builder = {
    select: () => builder,
    in: (...args: unknown[]) => {
      consultasFeitas.push(args);
      return builder;
    },
    eq: () => Promise.resolve(respostaConsulta.valor),
  };
  return { supabase: { from: () => builder } };
});

import {
  findClosedInvoiceBlock,
  affectedCardIds,
  CLOSED_INVOICE_MESSAGE,
} from "@/lib/invoiceGuard";

const linha = (credit_card_id: string | null, due_date: string | null) => ({
  credit_card_id,
  due_date,
});

beforeEach(() => {
  consultasFeitas.length = 0;
  respostaConsulta.valor = { data: [], error: null };
});

describe("findClosedInvoiceBlock", () => {
  it("bloqueia quando a linha cai num ciclo fechado", async () => {
    respostaConsulta.valor = {
      data: [{ credit_card_id: "card-1", month: 8, year: 2026, status: "closed" }],
      error: null,
    };

    const bloqueio = await findClosedInvoiceBlock([linha("card-1", "2026-08-15")]);

    expect(bloqueio).toBe(CLOSED_INVOICE_MESSAGE);
  });

  it("libera quando o ciclo fechado é de outro mês", async () => {
    respostaConsulta.valor = {
      data: [{ credit_card_id: "card-1", month: 7, year: 2026, status: "closed" }],
      error: null,
    };

    expect(await findClosedInvoiceBlock([linha("card-1", "2026-08-15")])).toBeNull();
  });

  it("libera quando o ciclo fechado é de outro cartão", async () => {
    respostaConsulta.valor = {
      data: [{ credit_card_id: "card-2", month: 8, year: 2026, status: "closed" }],
      error: null,
    };

    expect(await findClosedInvoiceBlock([linha("card-1", "2026-08-15")])).toBeNull();
  });

  it("usa o mês escrito na data, sem passar por fuso", async () => {
    // Vencimento dia 1 é o caso que quebrava: `new Date("2026-03-01").getMonth()`
    // devolve fevereiro em UTC-3, e a trava olhava o ciclo errado.
    respostaConsulta.valor = {
      data: [{ credit_card_id: "card-1", month: 3, year: 2026, status: "closed" }],
      error: null,
    };

    expect(await findClosedInvoiceBlock([linha("card-1", "2026-03-01")])).toBe(
      CLOSED_INVOICE_MESSAGE,
    );
  });

  describe("linhas que não tocam fatura", () => {
    it("não consulta o banco quando nenhuma linha tem cartão", async () => {
      const bloqueio = await findClosedInvoiceBlock([
        linha(null, "2026-08-15"),
        linha(null, null),
      ]);

      expect(bloqueio).toBeNull();
      expect(consultasFeitas).toHaveLength(0);
    });

    it("ignora linha de cartão sem vencimento", async () => {
      expect(await findClosedInvoiceBlock([linha("card-1", null)])).toBeNull();
      expect(consultasFeitas).toHaveLength(0);
    });

    it("devolve null para lista vazia", async () => {
      expect(await findClosedInvoiceBlock([])).toBeNull();
    });
  });

  it("consulta cada cartão uma vez só, mesmo com muitas linhas", async () => {
    respostaConsulta.valor = { data: [], error: null };

    await findClosedInvoiceBlock([
      linha("card-1", "2026-08-15"),
      linha("card-1", "2026-09-15"),
      linha("card-2", "2026-08-15"),
      linha("card-1", "2026-08-20"),
    ]);

    expect(consultasFeitas).toHaveLength(1);
    const [, ids] = consultasFeitas[0] as [string, string[]];
    expect([...ids].sort()).toEqual(["card-1", "card-2"]);
  });

  it("falha ABERTO quando a consulta dá erro", async () => {
    // Decisão deliberada: a trava é proteção de conferência, não controle de
    // segurança. Derrubar a operação por instabilidade de rede seria pior do
    // que deixar passar.
    respostaConsulta.valor = { data: null, error: { message: "network" } };

    expect(await findClosedInvoiceBlock([linha("card-1", "2026-08-15")])).toBeNull();
  });
});

describe("affectedCardIds", () => {
  it("devolve os cartões distintos tocados", () => {
    const ids = affectedCardIds([
      linha("card-1", "2026-08-15"),
      linha("card-2", "2026-08-15"),
      linha("card-1", "2026-09-15"),
      linha(null, "2026-08-15"),
    ]);

    expect([...ids].sort()).toEqual(["card-1", "card-2"]);
  });

  it("devolve lista vazia quando nada toca cartão", () => {
    expect(affectedCardIds([linha(null, "2026-08-15")])).toEqual([]);
  });
});

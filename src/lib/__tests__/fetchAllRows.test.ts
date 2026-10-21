import { describe, it, expect, vi } from "vitest";
import { fetchAllRows, MAX_ROWS, PAGE_SIZE } from "@/lib/fetchAllRows";

/**
 * O PostgREST corta a resposta no teto do projeto (1000 no Supabase) sem
 * devolver erro. O servidor falso abaixo faz o mesmo: devolve o recorte pedido,
 * limitado ao teto.
 */
const servidor = (total: number, teto = 1000) => {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const page = vi.fn((from: number, to: number) =>
    Promise.resolve({ data: linhas.slice(from, Math.min(to + 1, from + teto)), error: null }),
  );
  return { linhas, page };
};

describe("fetchAllRows", () => {
  it("lê além das 1000 linhas que uma consulta só devolveria", async () => {
    const { linhas, page } = servidor(2345);
    expect(await fetchAllRows(page)).toEqual(linhas);
  });

  it("pede páginas contíguas e para na primeira vazia", async () => {
    const { page } = servidor(1200);
    await fetchAllRows(page);
    expect(page.mock.calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
      [1200, 1200 + PAGE_SIZE - 1],
    ]);
  });

  it("não pula linha quando o teto do projeto é menor que a página", async () => {
    // Avançar por PAGE_SIZE em vez do que veio pularia 200 linhas por página.
    const { linhas, page } = servidor(1234, 300);
    expect(await fetchAllRows(page)).toEqual(linhas);
  });

  it("devolve vazio quando não há linha", async () => {
    const { page } = servidor(0);
    expect(await fetchAllRows(page)).toEqual([]);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("propaga o erro em vez de devolver o que já tinha lido", async () => {
    const cheia = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i }));
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: cheia, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "timeout" } });

    await expect(fetchAllRows(page)).rejects.toEqual({ message: "timeout" });
  });

  it("interrompe com erro acima de MAX_ROWS em vez de girar para sempre", async () => {
    const cheia = Array.from({ length: PAGE_SIZE }, (_, i) => i);
    const page = vi.fn(() => Promise.resolve({ data: cheia, error: null }));

    await expect(fetchAllRows(page)).rejects.toThrow(/acima do previsto/);
    expect(page).toHaveBeenCalledTimes(MAX_ROWS / PAGE_SIZE + 1);
  });
});

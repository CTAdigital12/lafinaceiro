import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A importação de fatura/extrato por PDF mandava a CHAVE PUBLICÁVEL no
 * `Authorization`, não o JWT da sessão. `parse-invoice` valida com
 * `getClaims()`, que não encontra claims numa chave publicável, e devolve
 * "Sessão inválida ou expirada" — o PDF nunca funcionava, só a planilha (que é
 * toda local e não passa por edge function).
 *
 * O teste trava as duas coisas: o token é o da sessão, e a chave publicável
 * continua indo em `apikey`, que é onde o gateway a espera.
 */
const sessao = vi.hoisted(() => ({
  data: { session: null as { access_token: string } | null },
  error: null as { message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => Promise.resolve(sessao) } },
}));

import { edgeFunctionAuthHeaders } from "@/lib/edgeFunctionAuth";

beforeEach(() => {
  sessao.data.session = null;
  sessao.error = null;
});

describe("edgeFunctionAuthHeaders", () => {
  it("manda o JWT da sessão no Authorization, não a chave publicável", async () => {
    sessao.data.session = { access_token: "jwt-da-sessao" };

    const headers = await edgeFunctionAuthHeaders();

    expect(headers.Authorization).toBe("Bearer jwt-da-sessao");
    expect(headers.Authorization).not.toContain(
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_",
    );
  });

  it("mantém a chave publicável em apikey", async () => {
    sessao.data.session = { access_token: "jwt-da-sessao" };

    const headers = await edgeFunctionAuthHeaders();

    expect(headers).toHaveProperty("apikey");
  });

  it("falha com mensagem clara quando não há sessão", async () => {
    await expect(edgeFunctionAuthHeaders()).rejects.toThrow(/Sessão expirada/);
  });

  it("falha quando getSession devolve erro", async () => {
    sessao.error = { message: "network" };

    await expect(edgeFunctionAuthHeaders()).rejects.toThrow(/Sessão expirada/);
  });
});

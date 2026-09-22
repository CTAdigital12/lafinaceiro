import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * O achado M10: sem guarda, faltar variável de ambiente virava
 * `createClient(undefined, undefined)` — client apontando para lugar nenhum,
 * toda consulta falhando de um jeito diferente e nenhuma mensagem em lugar
 * nenhum. Aqui a falha precisa ser imediata e dizer QUAL variável falta.
 *
 * O módulo é importado dinamicamente porque a guarda roda no carregamento:
 * é preciso mexer no ambiente ANTES do import, e limpar o cache entre os casos.
 */
describe("guarda de ambiente do client do Supabase", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  const importar = () => import("@/integrations/supabase/client");

  it("falha na hora, nomeando a URL que falta", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave-de-teste");

    await expect(importar()).rejects.toThrow(/VITE_SUPABASE_URL/);
  });

  it("falha na hora, nomeando a chave que falta", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    await expect(importar()).rejects.toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("nomeia as DUAS quando faltam as duas, em vez de mandar descobrir a próxima", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    await expect(importar()).rejects.toThrow(
      /VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("diz o que fazer, não só o que faltou", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    await expect(importar()).rejects.toThrow(/\.env/);
  });

  it("com as duas presentes, o client sobe normalmente", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave-de-teste");

    const { supabase } = await importar();
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe("function");
  });
});

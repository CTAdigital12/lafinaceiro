import { describe, it, expect } from "vitest";
import { edgeFunctionErrorMessage, edgeFunctionInvokeError } from "../edgeFunctionError";

const FALLBACK = "Erro ao processar fatura";

describe("edgeFunctionErrorMessage", () => {
  it("prefere a frase escrita para a pessoa quando ela existe", () => {
    expect(
      edgeFunctionErrorMessage(
        { error: "feature_disabled", message: "Parse de fatura por IA está temporariamente desabilitado." },
        FALLBACK,
      ),
    ).toBe("Parse de fatura por IA está temporariamente desabilitado.");
  });

  it("mostra o `error` quando ele já é uma frase", () => {
    expect(edgeFunctionErrorMessage({ error: "Acesso não autorizado" }, FALLBACK)).toBe(
      "Acesso não autorizado",
    );
  });

  // O caso que fazia a tela mostrar "invalid_ai_output".
  it("não mostra um código sozinho: usa o texto de reserva e cita o código", () => {
    expect(edgeFunctionErrorMessage({ error: "invalid_ai_output" }, FALLBACK)).toBe(
      "Erro ao processar fatura (invalid_ai_output)",
    );
  });

  it.each([
    ["objeto vazio", {}],
    ["null", null],
    ["undefined", undefined],
    ["string solta", "caiu"],
    ["error vazio", { error: "" }],
    ["error só com espaços", { error: "   " }],
    ["error de outro tipo", { error: 42 }],
    ["message de outro tipo", { message: { texto: "oi" } }],
  ])("cai no texto de reserva quando o corpo é %s", (_caso, corpo) => {
    expect(edgeFunctionErrorMessage(corpo, FALLBACK)).toBe(FALLBACK);
  });

  it("ignora message em branco e volta para o error", () => {
    expect(edgeFunctionErrorMessage({ error: "Sessão inválida ou expirada", message: "  " }, FALLBACK)).toBe(
      "Sessão inválida ou expirada",
    );
  });

  it.each([
    ["com acento", "não autorizado"],
    ["com espaço", "erro grave"],
    ["com maiúscula", "Erro"],
    ["com pontuação", "falhou."],
  ])("trata como frase, não como código, o texto %s", (_caso, texto) => {
    expect(edgeFunctionErrorMessage({ error: texto }, FALLBACK)).toBe(texto);
  });
});

describe("edgeFunctionInvokeError", () => {
  const MENSAGEM_GENERICA = "Edge Function returned a non-2xx status code";
  const FALLBACK_MEMBRO = "Não foi possível adicionar o membro";

  const httpError = (corpo: unknown, status = 400) => ({
    data: null,
    error: Object.assign(new Error(MENSAGEM_GENERICA), {
      context: new Response(JSON.stringify(corpo), { status }),
    }),
  });

  it("devolve null quando deu tudo certo", async () => {
    const res = { data: { success: true, id: "acesso-1" }, error: null };

    expect(await edgeFunctionInvokeError(res, FALLBACK_MEMBRO)).toBeNull();
  });

  // O caso que motivou o módulo: sem ler o corpo, a tela mostrava
  // "Edge Function returned a non-2xx status code" em vez do que fazer.
  it("lê o corpo do 403 em vez da frase genérica do FunctionsHttpError", async () => {
    const res = httpError(
      { error: "Esta operação exige autenticação em dois fatores. Saia e entre novamente informando o código do aplicativo." },
      403,
    );

    expect(await edgeFunctionInvokeError(res, FALLBACK_MEMBRO)).toBe(
      "Esta operação exige autenticação em dois fatores. Saia e entre novamente informando o código do aplicativo.",
    );
  });

  it("lê o corpo do campo `response`, que as versões novas devolvem junto", async () => {
    const res = {
      data: null,
      error: new Error(MENSAGEM_GENERICA),
      response: new Response(JSON.stringify({ error: "Este usuário já tem acesso" }), { status: 400 }),
    };

    expect(await edgeFunctionInvokeError(res, FALLBACK_MEMBRO)).toBe("Este usuário já tem acesso");
  });

  it("prefere a frase ao código quando o corpo traz os dois", async () => {
    const res = httpError({ error: "file_too_large", message: "Arquivo de 12MB excede o máximo de 10MB." }, 413);

    expect(await edgeFunctionInvokeError(res, "Erro ao processar fatura")).toBe(
      "Arquivo de 12MB excede o máximo de 10MB.",
    );
  });

  it("cai no texto de reserva quando o corpo não é JSON", async () => {
    const res = {
      data: null,
      error: Object.assign(new Error(MENSAGEM_GENERICA), {
        context: new Response("<html>502</html>", { status: 502 }),
      }),
    };

    expect(await edgeFunctionInvokeError(res, FALLBACK_MEMBRO)).toBe(FALLBACK_MEMBRO);
  });

  it("não repete a frase genérica quando não há corpo nenhum", async () => {
    const res = { data: null, error: new Error(MENSAGEM_GENERICA) };

    expect(await edgeFunctionInvokeError(res, FALLBACK_MEMBRO)).toBe(FALLBACK_MEMBRO);
  });

  // Erro de rede não tem corpo, mas a mensagem dele diz algo de útil.
  it("preserva a mensagem de um erro que não é HTTP", async () => {
    const res = { data: null, error: new Error("Failed to send a request to the Edge Function") };

    expect(await edgeFunctionInvokeError(res, FALLBACK_MEMBRO)).toBe(
      "Failed to send a request to the Edge Function",
    );
  });

  it("pega o erro devolvido com status 200 no corpo", async () => {
    const res = { data: { error: "Nenhuma transação encontrada" }, error: null };

    expect(await edgeFunctionInvokeError(res, FALLBACK_MEMBRO)).toBe("Nenhuma transação encontrada");
  });

  it("não confunde uma resposta de sucesso com erro", async () => {
    expect(await edgeFunctionInvokeError({ data: { success: true, created: true }, error: null }, FALLBACK_MEMBRO)).toBeNull();
    expect(await edgeFunctionInvokeError({ data: null, error: null }, FALLBACK_MEMBRO)).toBeNull();
  });
});

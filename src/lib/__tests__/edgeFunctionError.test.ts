import { describe, it, expect } from "vitest";
import { edgeFunctionErrorMessage } from "../edgeFunctionError";

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

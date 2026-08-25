import { describe, it, expect } from "vitest";
import { mensagemDeErro } from "../mensagemDeErro";

describe("mensagemDeErro", () => {
  it("preserva a mensagem de um Error", () => {
    expect(mensagemDeErro(new Error("Este usuário já tem acesso"))).toBe(
      "Este usuário já tem acesso",
    );
  });

  // O motivo de existir: `catch (e: any)` + `e.message` mostrava `undefined`
  // na tela quando o que era lançado não fosse um Error.
  it.each([
    ["string", "falhou"],
    ["null", null],
    ["undefined", undefined],
    ["número", 42],
    ["objeto solto", { message: "não sou um Error" }],
  ])("devolve o texto de fallback para %s", (_caso, valor) => {
    expect(mensagemDeErro(valor)).toBe("Erro ao processar solicitação");
  });

  it("preserva a mensagem de subclasses de Error", () => {
    class ErroDeRede extends Error {}
    expect(mensagemDeErro(new ErroDeRede("sem conexão"))).toBe("sem conexão");
  });

  it("devolve string vazia quando o Error tem mensagem vazia, sem inventar texto", () => {
    expect(mensagemDeErro(new Error(""))).toBe("");
  });
});

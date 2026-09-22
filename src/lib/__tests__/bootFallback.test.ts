import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mostrarFalhaDeBoot } from "@/lib/bootFallback";

describe("mostrarFalhaDeBoot (achado M10)", () => {
  let raiz: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    raiz = document.getElementById("root")!;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("a tela deixa de ficar muda: escreve o motivo onde o App entraria", () => {
    mostrarFalhaDeBoot(new Error("Configuração ausente: VITE_SUPABASE_URL."), raiz);

    expect(raiz.textContent).toContain("Não foi possível iniciar o aplicativo");
    expect(raiz.textContent).toContain("VITE_SUPABASE_URL");
  });

  it("diz que os dados estão a salvo — é erro de ambiente, não de dado", () => {
    mostrarFalhaDeBoot(new Error("qualquer coisa"), raiz);
    expect(raiz.textContent).toContain("nada foi perdido");
  });

  it("é anunciada para leitor de tela", () => {
    mostrarFalhaDeBoot(new Error("x"), raiz);
    expect(raiz.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("substitui meia tela pintada em vez de conviver com ela", () => {
    raiz.innerHTML = "<span>pedaço do app que chegou a montar</span>";
    mostrarFalhaDeBoot(new Error("x"), raiz);
    expect(raiz.textContent).not.toContain("pedaço do app");
  });

  it("aceita o que não é Error sem quebrar de novo", () => {
    mostrarFalhaDeBoot("string solta", raiz);
    expect(raiz.textContent).toContain("string solta");
  });

  it("não explode se nem o #root existir", () => {
    expect(() => mostrarFalhaDeBoot(new Error("x"), null)).not.toThrow();
  });

  it("registra no console, para quem estiver com o DevTools aberto", () => {
    const erro = new Error("x");
    mostrarFalhaDeBoot(erro, raiz);
    expect(console.error).toHaveBeenCalledWith("[boot] o aplicativo não iniciou:", erro);
  });
});

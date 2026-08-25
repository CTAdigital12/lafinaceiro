import { describe, it, expect } from "vitest";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  SELECTABLE_ASSET_TYPES,
  assetTypeLabel,
  listAssetTypes,
  selectableTypesFor,
} from "@/lib/investments/assetTypes";

const comAtivos = (tipos: Record<string, number>) =>
  Object.fromEntries(Object.entries(tipos).map(([t, n]) => [t, Array.from({ length: n }, () => ({}))]));

describe("rótulos de tipo de ativo", () => {
  it("todo tipo da união tem rótulo — é o que impedia acoes/etfs/bdrs de aparecerem", () => {
    for (const tipo of ASSET_TYPES) {
      expect(ASSET_TYPE_LABELS[tipo], `sem rótulo para ${tipo}`).toBeTruthy();
    }
  });

  it("tipo desconhecido cai no valor cru em vez de sumir da tela", () => {
    expect(assetTypeLabel("previdencia")).toBe("previdencia");
    expect(assetTypeLabel("renda_fixa")).toBe("Renda Fixa");
  });

  it("todo tipo ofertado no cadastro pertence à união", () => {
    for (const tipo of SELECTABLE_ASSET_TYPES) {
      expect(ASSET_TYPES).toContain(tipo);
    }
  });

  it("ações, ETFs e BDRs são exibíveis mas não ofertados no cadastro", () => {
    for (const tipo of ["acoes", "etfs", "bdrs"] as const) {
      expect(ASSET_TYPES).toContain(tipo);
      expect(ASSET_TYPE_LABELS[tipo]).toBeTruthy();
      expect(SELECTABLE_ASSET_TYPES).not.toContain(tipo);
    }
  });
});

describe("listAssetTypes — quais grupos a tabela mostra", () => {
  it("segue a ordem da união, não a ordem de chegada dos dados", () => {
    expect(listAssetTypes(comAtivos({ crypto: 1, renda_fixa: 2, fundos: 1 }))).toEqual([
      "renda_fixa",
      "fundos",
      "crypto",
    ]);
  });

  it("inclui os tipos que o cadastro não oferece", () => {
    expect(listAssetTypes(comAtivos({ renda_fixa: 1, acoes: 1, bdrs: 2 }))).toEqual([
      "renda_fixa",
      "acoes",
      "bdrs",
    ]);
  });

  it("inclui tipo inesperado do banco, depois dos conhecidos", () => {
    // A coluna `asset_type` é `text` livre: nada impede um valor novo entrar
    // por importação. Ele tem que aparecer, nem que seja com o nome cru.
    expect(listAssetTypes(comAtivos({ previdencia: 1, renda_fixa: 1 }))).toEqual([
      "renda_fixa",
      "previdencia",
    ]);
  });

  it("ignora grupo vazio e mapa vazio", () => {
    expect(listAssetTypes(comAtivos({ renda_fixa: 0, crypto: 1 }))).toEqual(["crypto"]);
    expect(listAssetTypes({})).toEqual([]);
  });

  it("nenhum ativo fica de fora: a soma dos grupos é a soma de tudo", () => {
    const mapa = comAtivos({ renda_fixa: 3, acoes: 2, previdencia: 1 });
    const naTela = listAssetTypes(mapa).reduce((n, t) => n + mapa[t].length, 0);
    const total = Object.values(mapa).reduce((n, l) => n + l.length, 0);
    expect(naTela).toBe(total);
  });
});

describe("selectableTypesFor — opções do select ao editar", () => {
  it("no cadastro (sem tipo) oferece só os cinco", () => {
    expect(selectableTypesFor("")).toEqual([...SELECTABLE_ASSET_TYPES]);
    expect(selectableTypesFor(null)).toEqual([...SELECTABLE_ASSET_TYPES]);
  });

  it("não duplica o tipo quando ele já é ofertado", () => {
    expect(selectableTypesFor("crypto")).toEqual([...SELECTABLE_ASSET_TYPES]);
  });

  it("acrescenta o tipo do ativo em edição quando ele não é ofertado", () => {
    expect(selectableTypesFor("acoes")).toEqual([...SELECTABLE_ASSET_TYPES, "acoes"]);
    expect(selectableTypesFor("previdencia")).toEqual([...SELECTABLE_ASSET_TYPES, "previdencia"]);
  });
});

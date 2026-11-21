import { describe, it, expect } from "vitest";
import { resolveTicker, tickerIsRequired } from "@/lib/investments/assetTicker";

describe("código do ativo", () => {
  it("é opcional para ativo por saldo e obrigatório para ativo por cotação", () => {
    expect(tickerIsRequired("capitalizacao")).toBe(false);
    expect(tickerIsRequired("renda_fixa")).toBe(false);
    expect(tickerIsRequired("fundos")).toBe(false);
    expect(tickerIsRequired("renda_variavel")).toBe(true);
    expect(tickerIsRequired("crypto")).toBe(true);
  });

  it("gera o código pelo nome quando o ativo por saldo vem sem código", () => {
    expect(resolveTicker("", "PIC Itaú", "capitalizacao")).toBe("PIC_ITAÚ");
    expect(resolveTicker("   ", "CDB Banco Master 110% CDI", "renda_fixa")).toBe("CDB_BANCO");
  });

  it("respeita o código informado, em maiúsculas", () => {
    expect(resolveTicker(" pic ", "PIC Itaú", "capitalizacao")).toBe("PIC");
    expect(resolveTicker("vale3", "Vale", "renda_variavel")).toBe("VALE3");
  });
});

import { assetFormSchema } from "@/lib/investments/assetFormSchema";

describe("formulário de ativo — validação do código", () => {
  const base = { name: "PIC Itaú", asset_type: "capitalizacao", current_price: 0 };

  it("aceita ativo por saldo sem código (o caso do PIC)", () => {
    expect(assetFormSchema.safeParse({ ...base, ticker: "" }).success).toBe(true);
  });

  it("recusa ativo por cotação sem código, no campo certo", () => {
    const r = assetFormSchema.safeParse({ ...base, asset_type: "renda_variavel", ticker: "  " });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ["ticker"], message: "Ticker é obrigatório" });
  });
});

import { describe, it, expect } from "vitest";
import {
  computeAssetUpdateOnBuy,
  computeAssetUpdateOnSell,
  type AssetMutationInput,
} from "../assetMutation";

const acaoBase: AssetMutationInput = {
  quantity: 100,
  average_price: 10,
  pricing_method: "unit_price",
  current_balance: 0,
};

const cdbBase: AssetMutationInput = {
  quantity: 1,
  average_price: 0,
  pricing_method: "total_balance",
  current_balance: 50_000,
};

describe("computeAssetUpdateOnBuy", () => {
  it("recalcula preço médio ponderado em ativos unit_price", () => {
    // 100 @ 10 + 50 @ 16 = 1000 + 800 = 1800 / 150 = 12
    const out = computeAssetUpdateOnBuy(acaoBase, {
      quantity: 50,
      unit_price: 16,
      fees: 0,
    });
    expect(out).toEqual({
      quantity: 150,
      average_price: expect.closeTo(12, 4),
    });
  });

  it("inclui fees no recálculo de preço médio em unit_price", () => {
    // (100*10) + (10*20 + 5 fee) = 1000 + 205 = 1205 / 110 ≈ 10.9545
    const out = computeAssetUpdateOnBuy(acaoBase, {
      quantity: 10,
      unit_price: 20,
      fees: 5,
    });
    expect(out).toEqual({
      quantity: 110,
      average_price: expect.closeTo(10.9545, 3),
    });
  });

  it("incrementa current_balance em ativos total_balance (renda fixa)", () => {
    // aporte de R$ 5.000 em CDB já com R$ 50.000
    const out = computeAssetUpdateOnBuy(cdbBase, {
      quantity: 1,
      unit_price: 5_000,
      fees: 0,
    });
    expect(out).toEqual({ current_balance: 55_000 });
  });

  it("aporte total_balance soma fees ao current_balance", () => {
    const out = computeAssetUpdateOnBuy(cdbBase, {
      quantity: 1,
      unit_price: 5_000,
      fees: 25,
    });
    expect(out).toEqual({ current_balance: 55_025 });
  });

  it("não retorna campos extras inesperados (lean payload pra supabase.update)", () => {
    const out = computeAssetUpdateOnBuy(cdbBase, { quantity: 1, unit_price: 1, fees: 0 });
    expect(Object.keys(out)).toEqual(["current_balance"]);
  });
});

describe("computeAssetUpdateOnSell", () => {
  it("reduz quantity em ativos unit_price (ação)", () => {
    const out = computeAssetUpdateOnSell(acaoBase, {
      quantity: 30,
      total_value: 30 * 15,
    });
    expect(out).toEqual({ quantity: 70 });
  });

  it("reduz current_balance em ativos total_balance (CDB) — REGRESSION FIX", () => {
    // Bug histórico: resgate de R$ 5.000 de um CDB de R$ 50.000 deve resultar
    // em current_balance = R$ 45.000. Antes do fix, current_balance nunca mudava.
    const out = computeAssetUpdateOnSell(cdbBase, {
      quantity: 1,
      total_value: 5_000,
    });
    expect(out).toEqual({ current_balance: 45_000 });
  });

  it("não permite quantity negativo (clamp em 0)", () => {
    const out = computeAssetUpdateOnSell(acaoBase, {
      quantity: 200,
      total_value: 0,
    });
    expect(out).toEqual({ quantity: 0 });
  });

  it("não permite current_balance negativo em total_balance (clamp em 0)", () => {
    const out = computeAssetUpdateOnSell(cdbBase, {
      quantity: 1,
      total_value: 99_999,
    });
    expect(out).toEqual({ current_balance: 0 });
  });

  it("para total_balance ignora `quantity` da operação (campo irrelevante no domínio)", () => {
    const sameOnDifferentQty1 = computeAssetUpdateOnSell(cdbBase, {
      quantity: 0,
      total_value: 1_000,
    });
    const sameOnDifferentQty2 = computeAssetUpdateOnSell(cdbBase, {
      quantity: 999,
      total_value: 1_000,
    });
    expect(sameOnDifferentQty1).toEqual(sameOnDifferentQty2);
  });

  it("payload de total_balance não inclui quantity (evita zerar quantity=1)", () => {
    const out = computeAssetUpdateOnSell(cdbBase, {
      quantity: 1,
      total_value: 1_000,
    });
    expect(Object.keys(out)).toEqual(["current_balance"]);
  });

  it("trata current_balance null como 0 sem quebrar", () => {
    const out = computeAssetUpdateOnSell(
      { ...cdbBase, current_balance: null as unknown as number },
      { quantity: 1, total_value: 100 },
    );
    expect(out).toEqual({ current_balance: 0 });
  });
});

describe("pricing_method desconhecido (defesa contra evolução de schema)", () => {
  it("computeAssetUpdateOnBuy lança erro pra pricing_method não suportado", () => {
    const weird = {
      ...acaoBase,
      pricing_method: "yield_based" as unknown as "unit_price",
    };
    expect(() =>
      computeAssetUpdateOnBuy(weird, { quantity: 1, unit_price: 1, fees: 0 }),
    ).toThrow(/Unsupported pricing_method/i);
  });

  it("computeAssetUpdateOnSell lança erro pra pricing_method não suportado", () => {
    const weird = {
      ...acaoBase,
      pricing_method: undefined as unknown as "unit_price",
    };
    expect(() =>
      computeAssetUpdateOnSell(weird, { quantity: 1, total_value: 1 }),
    ).toThrow(/Unsupported pricing_method/i);
  });
});

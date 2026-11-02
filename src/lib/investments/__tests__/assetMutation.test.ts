import { describe, it, expect } from "vitest";
import {
  computeAssetUpdateOnBuy,
  computeAssetUpdateOnSell,
  computeAssetUpdateOnBuyReverse,
  computeAssetUpdateOnSellReverse,
  type AssetMutationInput,
} from "../assetMutation";

const acaoBase: AssetMutationInput = {
  quantity: 100,
  average_price: 10,
  pricing_method: "unit_price",
  current_balance: 0,
};

// Renda fixa: quantity = 1 e o valor aplicado vive em average_price.
const cdbBase: AssetMutationInput = {
  quantity: 1,
  average_price: 40_000,
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

  it("aporte em total_balance soma ao saldo E ao valor aplicado", () => {
    // aporte de R$ 5.000 em CDB com R$ 50.000 de saldo e R$ 40.000 aplicados
    const out = computeAssetUpdateOnBuy(cdbBase, {
      quantity: 1,
      unit_price: 5_000,
      fees: 0,
    });
    expect(out).toEqual({ current_balance: 55_000, average_price: 45_000 });
  });

  it("aporte total_balance soma fees ao current_balance", () => {
    const out = computeAssetUpdateOnBuy(cdbBase, {
      quantity: 1,
      unit_price: 5_000,
      fees: 25,
    });
    expect(out).toEqual({ current_balance: 55_025, average_price: 45_025 });
  });

  it("payload de total_balance não inclui quantity (lean payload pra supabase.update)", () => {
    const out = computeAssetUpdateOnBuy(cdbBase, { quantity: 1, unit_price: 1, fees: 0 });
    expect(Object.keys(out).sort()).toEqual(["average_price", "current_balance"]);
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
    expect(out).toMatchObject({ current_balance: 45_000 });
  });

  it("resgate em total_balance reduz o aplicado na proporção do saldo resgatado", () => {
    // Resgatar 10% do saldo leva 10% do aplicado: 40.000 → 36.000. Antes, o
    // aplicado ficava parado e a tela mostrava o resgate como prejuízo.
    const out = computeAssetUpdateOnSell(cdbBase, { quantity: 1, total_value: 5_000 });
    expect(out).toEqual({ current_balance: 45_000, average_price: 36_000 });
  });

  it("reproduz o resgate do Trend Cash na XP (abr/2026)", () => {
    // Em 31/03 a XP mostrava R$ 22.990,25 de saldo e R$ 19.702,00 aplicados;
    // depois do resgate, R$ 15.453,22 aplicados — 21,5652% do aplicado saiu.
    const trendCash: AssetMutationInput = {
      quantity: 1,
      average_price: 19_702,
      pricing_method: "total_balance",
      current_balance: 22_990.25,
    };
    const resgate = 22_990.25 * (1 - 15_453.22 / 19_702);
    const out = computeAssetUpdateOnSell(trendCash, { quantity: 1, total_value: resgate });
    expect((out as { average_price: number }).average_price).toBeCloseTo(15_453.22, 1);
  });

  it("resgate total zera o aplicado", () => {
    const out = computeAssetUpdateOnSell(cdbBase, { quantity: 1, total_value: 50_000 });
    expect(out).toEqual({ current_balance: 0, average_price: 0 });
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
    expect(out).toEqual({ current_balance: 0, average_price: 0 });
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
    expect(Object.keys(out).sort()).toEqual(["average_price", "current_balance"]);
  });

  it("trata current_balance null como 0 sem quebrar", () => {
    const out = computeAssetUpdateOnSell(
      { ...cdbBase, current_balance: null as unknown as number },
      { quantity: 1, total_value: 100 },
    );
    expect(out).toEqual({ current_balance: 0, average_price: 0 });
  });
});

describe("computeAssetUpdateOnBuyReverse", () => {
  it("reverte buy em unit_price restaurando quantity e preço médio", () => {
    // Estado original: 100 @ 10. Buy de 50 @ 16 (sem fees) levou a 150 @ 12.
    // Reverter a partir do estado pós-buy deve retornar 100 @ 10.
    const postBuy: AssetMutationInput = {
      quantity: 150,
      average_price: 12,
      pricing_method: "unit_price",
      current_balance: 0,
    };
    const out = computeAssetUpdateOnBuyReverse(postBuy, {
      quantity: 50,
      unit_price: 16,
      fees: 0,
    });
    expect(out).toEqual({
      quantity: 100,
      average_price: expect.closeTo(10, 4),
    });
  });

  it("reverte buy em unit_price respeitando fees", () => {
    // 100 @ 10 + buy de 10 @ 20 com fee 5 → ((100*10) + (10*20 + 5)) / 110 = 1205/110 ≈ 10.9545
    const postBuy: AssetMutationInput = {
      quantity: 110,
      average_price: 1205 / 110,
      pricing_method: "unit_price",
      current_balance: 0,
    };
    const out = computeAssetUpdateOnBuyReverse(postBuy, {
      quantity: 10,
      unit_price: 20,
      fees: 5,
    });
    expect(out).toEqual({
      quantity: 100,
      average_price: expect.closeTo(10, 4),
    });
  });

  it("reverte buy em unit_price que zera quantity retorna average_price: 0", () => {
    // Era o único buy: pós-buy 50 @ 10. Reverter exatamente esses 50 leva a 0.
    const postBuy: AssetMutationInput = {
      quantity: 50,
      average_price: 10,
      pricing_method: "unit_price",
      current_balance: 0,
    };
    const out = computeAssetUpdateOnBuyReverse(postBuy, {
      quantity: 50,
      unit_price: 10,
      fees: 0,
    });
    expect(out).toEqual({ quantity: 0, average_price: 0 });
  });

  it("reverte buy em total_balance subtraindo aporte do saldo e do aplicado", () => {
    const postBuy: AssetMutationInput = {
      quantity: 1,
      average_price: 45_000,
      pricing_method: "total_balance",
      current_balance: 55_000,
    };
    const out = computeAssetUpdateOnBuyReverse(postBuy, {
      quantity: 1,
      unit_price: 5_000,
      fees: 0,
    });
    expect(out).toEqual({ current_balance: 50_000, average_price: 40_000 });
  });

  it("reverte buy em total_balance incluindo fees no aporte", () => {
    const postBuy: AssetMutationInput = {
      quantity: 1,
      average_price: 45_025,
      pricing_method: "total_balance",
      current_balance: 55_025,
    };
    const out = computeAssetUpdateOnBuyReverse(postBuy, {
      quantity: 1,
      unit_price: 5_000,
      fees: 25,
    });
    expect(out).toEqual({ current_balance: 50_000, average_price: 40_000 });
  });

  it("reverte buy em total_balance não permite current_balance negativo", () => {
    const postBuy: AssetMutationInput = {
      quantity: 1,
      average_price: 0,
      pricing_method: "total_balance",
      current_balance: 100,
    };
    const out = computeAssetUpdateOnBuyReverse(postBuy, {
      quantity: 1,
      unit_price: 5_000,
      fees: 0,
    });
    expect(out).toEqual({ current_balance: 0, average_price: 0 });
  });
});

describe("computeAssetUpdateOnSellReverse", () => {
  it("reverte sell em unit_price restaurando quantity", () => {
    // Estado pós-sell: 70 (era 100, vendeu 30). Reverter deve voltar a 100.
    const postSell: AssetMutationInput = {
      quantity: 70,
      average_price: 10,
      pricing_method: "unit_price",
      current_balance: 0,
    };
    const out = computeAssetUpdateOnSellReverse(postSell, {
      quantity: 30,
      total_value: 30 * 15,
    });
    expect(out).toEqual({ quantity: 100 });
  });

  it("reverte sell em total_balance devolvendo saldo e aplicado", () => {
    // Pós-resgate de 10%: 45.000 de saldo, 36.000 aplicados.
    const postSell: AssetMutationInput = {
      quantity: 1,
      average_price: 36_000,
      pricing_method: "total_balance",
      current_balance: 45_000,
    };
    const out = computeAssetUpdateOnSellReverse(postSell, {
      quantity: 1,
      total_value: 5_000,
    });
    expect(out).toEqual({ current_balance: 50_000, average_price: 40_000 });
  });

  it("reverso de resgate total não inventa aplicado (fica para o cadastro)", () => {
    const postSell: AssetMutationInput = {
      quantity: 1,
      average_price: 0,
      pricing_method: "total_balance",
      current_balance: 0,
    };
    const out = computeAssetUpdateOnSellReverse(postSell, {
      quantity: 1,
      total_value: 1_000,
    });
    expect(out).toEqual({ current_balance: 1_000, average_price: 0 });
    expect(Object.keys(out)).not.toContain("quantity");
  });
});

describe("reverse(apply(state)) === state", () => {
  it("buy + reverseBuy em unit_price é identidade", () => {
    const start = acaoBase; // 100 @ 10
    const buyOp = { quantity: 50, unit_price: 16, fees: 0 };
    const after = computeAssetUpdateOnBuy(start, buyOp);
    const reverted = computeAssetUpdateOnBuyReverse(
      {
        ...start,
        ...(after as { quantity: number; average_price: number }),
      },
      buyOp,
    );
    expect(reverted).toEqual({
      quantity: start.quantity,
      average_price: expect.closeTo(start.average_price, 8),
    });
  });

  it("sell + reverseSell em unit_price é identidade", () => {
    const start = acaoBase;
    const sellOp = { quantity: 30, total_value: 30 * 15 };
    const after = computeAssetUpdateOnSell(start, sellOp);
    const reverted = computeAssetUpdateOnSellReverse(
      { ...start, ...(after as { quantity: number }) },
      sellOp,
    );
    expect(reverted).toEqual({ quantity: start.quantity });
  });

  it("buy + reverseBuy em total_balance é identidade", () => {
    const start = cdbBase;
    const buyOp = { quantity: 1, unit_price: 5_000, fees: 25 };
    const after = computeAssetUpdateOnBuy(start, buyOp);
    const reverted = computeAssetUpdateOnBuyReverse({ ...start, ...after }, buyOp);
    expect(reverted).toEqual({
      current_balance: start.current_balance,
      average_price: expect.closeTo(start.average_price, 2),
    });
  });

  it("sell + reverseSell em total_balance é identidade", () => {
    const start = cdbBase;
    const sellOp = { quantity: 1, total_value: 5_000 };
    const after = computeAssetUpdateOnSell(start, sellOp);
    const reverted = computeAssetUpdateOnSellReverse({ ...start, ...after }, sellOp);
    expect(reverted).toEqual({
      current_balance: start.current_balance,
      average_price: expect.closeTo(start.average_price, 2),
    });
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

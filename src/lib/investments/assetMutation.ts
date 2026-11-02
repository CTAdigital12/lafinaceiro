/**
 * Helpers puros para mutar `investment_assets` ao registrar uma compra ou venda.
 *
 * Extraídos do hook `useInvestments` para permitir testes unitários e
 * deixar a regra de negócio (especialmente o desvio entre `pricing_method`
 * = "unit_price" vs "total_balance") explícita e auditável.
 *
 * NÃO faz I/O; o consumidor é responsável por chamar `supabase.update(...)`
 * com o payload retornado.
 */

import type { InvestmentAsset } from "@/hooks/useInvestments";

/**
 * Subset mínimo do `InvestmentAsset` necessário para computar mutações.
 * Aceitar este tipo facilita uso em testes com objetos parciais.
 */
export type AssetMutationInput = Pick<
  InvestmentAsset,
  "quantity" | "average_price" | "pricing_method" | "current_balance"
>;

/**
 * Payload pronto para `supabase.from("investment_assets").update(...)`.
 *
 * Quando `pricing_method = "total_balance"` (renda fixa, saldo em corretora),
 * mudam `current_balance` e o valor aplicado — guardado em `average_price`,
 * porque `quantity` é semanticamente fixo (1 unidade representando "o saldo
 * total") e o aplicado é `quantity * average_price`. `quantity` nunca entra.
 *
 * Quando `pricing_method = "unit_price"` (ações, ETFs, fundos, crypto),
 * `quantity` e `average_price` é que carregam o estado.
 */
export type AssetUpdatePayload =
  | { quantity: number; average_price: number }
  | { quantity: number }
  | { current_balance: number; average_price: number };

/**
 * Valor aplicado de um ativo por saldo total.
 *
 * Antes, aplicação e resgate só mexiam no saldo, e o aplicado ficava parado no
 * número do cadastro. O Trend Cash da XP seguiu com R$ 19.702,00 aplicados
 * depois de dois resgates, quando a XP já mostrava R$ 13.218,91, e a tela
 * exibia um prejuízo de R$ 3.071 num fundo que rendia.
 */
function appliedOf(asset: AssetMutationInput): number {
  return asset.quantity * asset.average_price;
}

/** `average_price` que faz `quantity * average_price` dar `applied`. */
function averageFor(asset: AssetMutationInput, applied: number): number {
  if (asset.quantity <= 0) return 0;
  return Math.round((Math.max(0, applied) / asset.quantity) * 100) / 100;
}

/**
 * Calcula o estado pós-compra do ativo.
 *
 * - `total_balance`: o aporte (`quantity * unit_price + fees`) soma ao
 *   `current_balance` e ao valor aplicado. `quantity` não é afetado.
 * - `unit_price`: recalcula preço médio ponderado por todas as posições.
 *
 * @param asset estado atual do ativo
 * @param incoming dados da operação de compra
 */
export function computeAssetUpdateOnBuy(
  asset: AssetMutationInput,
  incoming: { quantity: number; unit_price: number; fees: number },
): AssetUpdatePayload {
  if (asset.pricing_method === "total_balance") {
    const aporte = incoming.quantity * incoming.unit_price + incoming.fees;
    return {
      current_balance: (asset.current_balance || 0) + aporte,
      average_price: averageFor(asset, appliedOf(asset) + aporte),
    };
  }

  if (asset.pricing_method === "unit_price") {
    const currentTotal = asset.quantity * asset.average_price;
    const newTotal = incoming.quantity * incoming.unit_price + incoming.fees;
    const newQuantity = asset.quantity + incoming.quantity;
    const newAveragePrice = newQuantity > 0 ? (currentTotal + newTotal) / newQuantity : 0;
    return {
      quantity: newQuantity,
      average_price: newAveragePrice,
    };
  }

  // Falha rápida se um novo `pricing_method` for adicionado ao schema sem
  // atualizar este helper. Preferível a cair silenciosamente no ramo errado.
  throw new Error(
    `Unsupported pricing_method: ${String((asset as AssetMutationInput).pricing_method)}`,
  );
}

/**
 * Calcula o estado pós-venda/resgate do ativo.
 *
 * Resolve o bug histórico em renda fixa: antes, a venda só reduzia `quantity`,
 * mas o patrimônio de renda fixa vem de `current_balance`. Resultado: o saldo
 * de um CDB nunca diminuía após resgate, ficando inflado.
 *
 * - `total_balance`: reduz `current_balance` pelo `total_value` da venda
 *   (clampado em 0) e o valor aplicado NA MESMA PROPORÇÃO do saldo resgatado
 *   — a regra da corretora. No Trend Cash, em abr/2026, a XP abateu
 *   R$ 4.248,78 do aplicado num resgate de ~21,5% do saldo.
 * - `unit_price`: reduz `quantity` pela quantidade vendida (clampado em 0).
 *
 * O `total_value` registrado costuma ser o líquido que caiu na conta, depois
 * do IR; a corretora proporcionaliza pelo bruto. A diferença no aplicado é
 * pequena (dezenas de reais num resgate de milhares) e o aplicado continua
 * editável no cadastro do ativo.
 *
 * @param asset estado atual do ativo
 * @param sold dados da operação de venda
 */
export function computeAssetUpdateOnSell(
  asset: AssetMutationInput,
  sold: { quantity: number; total_value: number },
): AssetUpdatePayload {
  if (asset.pricing_method === "total_balance") {
    const balance = asset.current_balance || 0;
    const fraction = balance > 0 ? Math.min(1, sold.total_value / balance) : 1;
    return {
      current_balance: Math.max(0, balance - sold.total_value),
      average_price: averageFor(asset, appliedOf(asset) * (1 - fraction)),
    };
  }

  if (asset.pricing_method === "unit_price") {
    const newQuantity = asset.quantity - sold.quantity;
    return { quantity: Math.max(0, newQuantity) };
  }

  throw new Error(
    `Unsupported pricing_method: ${String((asset as AssetMutationInput).pricing_method)}`,
  );
}

/**
 * Inverso de `computeAssetUpdateOnBuy`. Desfaz o efeito de uma compra
 * previamente aplicada, usado ao editar/excluir uma operação.
 *
 * IMPORTANTE: para `unit_price`, o cálculo do novo `average_price` parte
 * do estado ATUAL do ativo. Se houve compras/vendas posteriores à compra
 * sendo revertida, o resultado não é o `average_price` histórico exato —
 * é o melhor possível sem event sourcing. Aceitável para correção de
 * lançamentos recentes; documentado como caveat conhecido na UI.
 */
export function computeAssetUpdateOnBuyReverse(
  asset: AssetMutationInput,
  original: { quantity: number; unit_price: number; fees: number },
): AssetUpdatePayload {
  if (asset.pricing_method === "total_balance") {
    const aporte = original.quantity * original.unit_price + original.fees;
    const newBalance = (asset.current_balance || 0) - aporte;
    return {
      current_balance: Math.max(0, newBalance),
      average_price: averageFor(asset, appliedOf(asset) - aporte),
    };
  }

  if (asset.pricing_method === "unit_price") {
    const currentTotal = asset.quantity * asset.average_price;
    const originalTotal = original.quantity * original.unit_price + original.fees;
    const newQuantity = asset.quantity - original.quantity;
    if (newQuantity <= 0) {
      return { quantity: 0, average_price: 0 };
    }
    const newAveragePrice = Math.max(0, (currentTotal - originalTotal) / newQuantity);
    return { quantity: newQuantity, average_price: newAveragePrice };
  }

  throw new Error(
    `Unsupported pricing_method: ${String((asset as AssetMutationInput).pricing_method)}`,
  );
}

/**
 * Inverso de `computeAssetUpdateOnSell`. Restaura a posição vendida ao
 * ativo. Para `unit_price`, `average_price` não é tocado (vendas não
 * alteram preço médio na operação direta, então o reverso também não).
 *
 * Para `total_balance`, o aplicado volta pela proporção inversa: o resgate
 * levou a fração `total_value / saldo_antes`, e `saldo_antes` é o saldo de
 * agora mais o resgate. Resgate TOTAL zerou o aplicado e não há de onde
 * recuperá-lo — o aplicado fica como está, para ser corrigido no cadastro. O
 * mesmo caveat de `computeAssetUpdateOnBuyReverse` vale aqui: com operações
 * posteriores no meio, o resultado é aproximado.
 */
export function computeAssetUpdateOnSellReverse(
  asset: AssetMutationInput,
  sold: { quantity: number; total_value: number },
): AssetUpdatePayload {
  if (asset.pricing_method === "total_balance") {
    const balanceBefore = (asset.current_balance || 0) + sold.total_value;
    const fraction = balanceBefore > 0 ? sold.total_value / balanceBefore : 0;
    const applied = fraction < 1 ? appliedOf(asset) / (1 - fraction) : appliedOf(asset);
    return {
      current_balance: balanceBefore,
      average_price: averageFor(asset, applied),
    };
  }

  if (asset.pricing_method === "unit_price") {
    return { quantity: asset.quantity + sold.quantity };
  }

  throw new Error(
    `Unsupported pricing_method: ${String((asset as AssetMutationInput).pricing_method)}`,
  );
}

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
 * apenas `current_balance` é mutado — `quantity` é semanticamente fixo
 * (1 unidade representando "o saldo total").
 *
 * Quando `pricing_method = "unit_price"` (ações, ETFs, fundos, crypto),
 * `quantity` e `average_price` é que carregam o estado.
 */
export type AssetUpdatePayload =
  | { quantity: number; average_price: number }
  | { quantity: number }
  | { current_balance: number };

/**
 * Calcula o estado pós-compra do ativo.
 *
 * - `total_balance`: o aporte aumenta `current_balance` em `total_value` do
 *   investimento (`quantity * unit_price + fees`). `quantity`/`average_price`
 *   não são afetados.
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
    return { current_balance: (asset.current_balance || 0) + aporte };
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
 *   (clampado em 0).
 * - `unit_price`: reduz `quantity` pela quantidade vendida (clampado em 0).
 *
 * @param asset estado atual do ativo
 * @param sold dados da operação de venda
 */
export function computeAssetUpdateOnSell(
  asset: AssetMutationInput,
  sold: { quantity: number; total_value: number },
): AssetUpdatePayload {
  if (asset.pricing_method === "total_balance") {
    const newBalance = (asset.current_balance || 0) - sold.total_value;
    return { current_balance: Math.max(0, newBalance) };
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
    return { current_balance: Math.max(0, newBalance) };
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
 */
export function computeAssetUpdateOnSellReverse(
  asset: AssetMutationInput,
  sold: { quantity: number; total_value: number },
): AssetUpdatePayload {
  if (asset.pricing_method === "total_balance") {
    return { current_balance: (asset.current_balance || 0) + sold.total_value };
  }

  if (asset.pricing_method === "unit_price") {
    return { quantity: asset.quantity + sold.quantity };
  }

  throw new Error(
    `Unsupported pricing_method: ${String((asset as AssetMutationInput).pricing_method)}`,
  );
}

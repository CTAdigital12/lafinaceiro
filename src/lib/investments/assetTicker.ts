import { usesTotalBalancePricing } from "./assetTypes";

/**
 * Código (ticker) de um ativo: quando é obrigatório e o que gravar quando não vem.
 *
 * Ativo acompanhado por SALDO (renda fixa, fundos, capitalização…) não tem
 * código de bolsa, e a tela o chama de "Código (opcional) — se não informado,
 * será gerado automaticamente". Mas o schema do formulário exigia o campo
 * (`min(1)`) antes de a geração rodar: ela nunca rodava, e cadastrar o PIC do
 * Itaú sem código parou em "Ticker é obrigatório" (20/11/2026).
 *
 * Ativo por cotação (ação, FII, cripto) continua exigindo: é o código que se
 * busca no mercado.
 */
export function tickerIsRequired(assetType: string): boolean {
  return !usesTotalBalancePricing(assetType);
}

export function resolveTicker(ticker: string, name: string, assetType: string): string {
  const informado = ticker.trim().toUpperCase();
  if (informado || tickerIsRequired(assetType)) return informado;
  return name.trim().substring(0, 10).trim().toUpperCase().replace(/\s+/g, "_");
}

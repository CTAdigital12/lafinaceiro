/**
 * Tipos de ativo: união, rótulos e ordem de exibição.
 *
 * Extraído de `useInvestments` para ser testável sem arrastar o cliente
 * Supabase, e para virar a fonte única de quais tipos EXISTEM (`ASSET_TYPES`)
 * versus quais podem ser ESCOLHIDOS no cadastro (`SELECTABLE_ASSET_TYPES`).
 *
 * A separação existe porque a coluna `asset_type` no banco é `text` livre: ela
 * aceita qualquer string, inclusive uma que nenhuma tela conheça. Antes disso,
 * `acoes`, `etfs` e `bdrs` estavam na união mas fora dos rótulos e fora da
 * tabela — um ativo desses contava no patrimônio total e no gráfico de pizza,
 * mas não aparecia em nenhuma linha da tabela. O total não batia com a soma
 * do que estava na tela, que é o pior jeito de esconder dinheiro.
 */

export const ASSET_TYPES = [
  "renda_fixa",
  "renda_variavel",
  "fundos",
  "crypto",
  "saldo_corretora",
  "acoes",
  "etfs",
  "bdrs",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * Rótulo de TODO tipo conhecido — inclusive os que não podem ser criados pela
 * tela. Serve para exibir; para montar o select use `SELECTABLE_ASSET_TYPES`.
 */
export const ASSET_TYPE_LABELS: Record<string, string> = {
  renda_fixa: "Renda Fixa",
  renda_variavel: "Renda Variável",
  fundos: "Fundos de Investimentos",
  crypto: "Criptomoedas",
  saldo_corretora: "Saldo em Corretora",
  acoes: "Ações",
  etfs: "ETFs",
  bdrs: "BDRs",
};

/**
 * O que o select de cadastro oferece. `acoes`, `etfs` e `bdrs` ficam de fora
 * de propósito: "Renda Variável" já cobre esses ativos no uso atual, e
 * oferecer os dois caminhos deixaria a escolha ambígua. Eles seguem sendo
 * EXIBIDOS quando existem no banco.
 */
export const SELECTABLE_ASSET_TYPES: readonly AssetType[] = [
  "renda_fixa",
  "renda_variavel",
  "fundos",
  "crypto",
  "saldo_corretora",
];

/** Rótulo para exibição, caindo no valor cru quando o tipo é desconhecido. */
export const assetTypeLabel = (type: string): string => ASSET_TYPE_LABELS[type] || type;

/**
 * Ordem em que os grupos aparecem: os tipos conhecidos primeiro, na ordem de
 * `ASSET_TYPES`, e depois QUALQUER outro tipo presente nos dados. É esse
 * segundo trecho que garante que um ativo não some da tela só porque o tipo
 * dele não estava previsto.
 */
export function listAssetTypes(assetsByType: Record<string, unknown[]>): string[] {
  const conhecidos = ASSET_TYPES.filter((t) => (assetsByType[t]?.length ?? 0) > 0);
  const extras = Object.keys(assetsByType).filter(
    (t) => !ASSET_TYPES.includes(t as AssetType) && (assetsByType[t]?.length ?? 0) > 0,
  );
  return [...conhecidos, ...extras];
}

/**
 * Opções do select ao EDITAR: se o ativo já é de um tipo que não está entre os
 * ofertados, ele entra na lista para não abrir o formulário com o campo vazio
 * (e para o usuário não trocar o tipo sem querer ao salvar).
 */
export function selectableTypesFor(currentType: string | null | undefined): string[] {
  if (currentType && !SELECTABLE_ASSET_TYPES.includes(currentType as AssetType)) {
    return [...SELECTABLE_ASSET_TYPES, currentType];
  }
  return [...SELECTABLE_ASSET_TYPES];
}

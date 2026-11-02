-- Os tipos de ativo que o código conhece passam a ser aceitos pelo banco.
--
-- A CHECK criada junto com a tabela (20260107223812) aceita só
-- renda_fixa, renda_variavel, fiis, crypto e saldo_corretora. O código foi
-- além: a tela de cadastro OFERECE "Fundos de Investimentos" (`fundos`), e
-- `acoes`, `etfs` e `bdrs` fazem parte da união `ASSET_TYPES`. Qualquer um
-- deles é recusado com 23514 (investment_assets_asset_type_check) — criar um
-- fundo pela tela nunca funcionou, e em 02/11/2026 a reclassificação dos
-- fundos de ações da XP parou nesse erro.
--
-- `fiis` continua aceito: não está no código, mas a CHECK original o
-- permitia e pode haver linha gravada com ele.
--
-- A lista tem que acompanhar `ASSET_TYPES` em
-- src/lib/investments/assetTypes.ts — há teste que confere.

alter table public.investment_assets
  drop constraint if exists investment_assets_asset_type_check;

alter table public.investment_assets
  add constraint investment_assets_asset_type_check
  check (asset_type in (
    'renda_fixa',
    'renda_variavel',
    'fundos',
    'crypto',
    'saldo_corretora',
    'acoes',
    'etfs',
    'bdrs',
    'fiis'
  ));

-- Adiciona `card_last_digits` em `transactions` para identificar qual cartão
-- virtual foi usado em cada transação (faturas exportam o número e hoje a
-- informação se perdia ao agrupar tudo sob o cartão pai). Capturado durante
-- a importação da fatura CSV e exibido em coluna própria na aba Cartão.
--
-- Nullable: transações antigas, manuais ou de conta corrente não têm o dado.

alter table public.transactions
  add column if not exists card_last_digits text;

alter table public.transactions
  add constraint transactions_card_last_digits_format
  check (card_last_digits is null or card_last_digits ~ '^[0-9]{4}$');

create index if not exists transactions_card_last_digits_idx
  on public.transactions (credit_card_id, card_last_digits)
  where card_last_digits is not null;

comment on column public.transactions.card_last_digits is
  'Últimos 4 dígitos do cartão virtual usado, capturado da fatura CSV. NULL para tx manuais ou de conta corrente.';

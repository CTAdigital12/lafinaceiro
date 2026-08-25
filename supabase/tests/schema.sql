-- Esquema mínimo que as três RPCs tocam. Só o suficiente para exercitá-las.
create extension if not exists pgcrypto;

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid,
  credit_card_id uuid,
  category_id uuid,
  description text not null,
  original_description text,
  amount numeric(12,2) not null,
  type text not null,
  date date not null,
  due_date date,
  status text not null default 'completed',
  is_corporate_expense boolean not null default false,
  is_reimbursable boolean not null default false,
  is_refund boolean not null default false,
  is_card_payment boolean not null default false,
  reimbursement_status text,
  installment_number int,
  total_installments int,
  installment_group_id uuid,
  is_provisional boolean not null default false,
  project_id uuid,
  card_last_digits text,
  recurring_rule_id uuid references public.recurring_rules(id),
  refunded_transaction_id uuid references public.transactions(id) on delete set null,
  reimbursement_payment_id uuid references public.transactions(id) on delete set null,
  reimbursement_income_id uuid references public.transactions(id) on delete set null,
  split_group_id uuid,
  split_parent_id uuid references public.transactions(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create role authenticated nologin;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

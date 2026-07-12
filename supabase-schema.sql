-- Journey to 500K — Database schema
-- Run this ONCE in the Supabase SQL Editor:
--   Supabase dashboard → SQL Editor → New query → paste all of this → Run

create extension if not exists "pgcrypto";

-- Households (one per family)
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Savings goal target (editable in Settings). Safe to run repeatedly.
alter table households add column if not exists goal_amount numeric not null default 500000;

-- Users within a household
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

-- Categories (income / expense / savings)
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income','expense','savings')),
  color text,
  icon text,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

-- Transactions
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  date date not null,
  description text,
  category text,                 -- denormalized category name (handy for display)
  type text not null check (type in ('income','expense','savings')),
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tx_household on transactions(household_id);
create index if not exists idx_tx_date on transactions(date);
create index if not exists idx_tx_type on transactions(type);

-- Row Level Security: lock the tables down. The app's server (API routes)
-- uses the service-role key, which bypasses RLS. No public/anon access.
alter table households   enable row level security;
alter table users        enable row level security;
alter table categories   enable row level security;
alter table transactions enable row level security;

-- Debts (for the dashboard Debt Management tab). A "Debt Repayment"
-- transaction counts toward a debt when its description matches the debt name.
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);
alter table debts enable row level security;

-- Budget line items (dashboard Budget tab). Each has a category; the tracker
-- rolls them up into per-category "envelopes" vs current-month actual spending.
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  category text not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);
alter table budgets enable row level security;

-- Investment holdings (Investments tab). Keyed on account_number+symbol so
-- re-uploads and a spouse's joint accounts dedupe (counted once).
create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner text not null,               -- Jean | Henriette | Joint | Noah
  account_type text not null,        -- TFSA, RRSP, RESP, LIRA, Crypto, Group TFSA
  account_number text not null,
  symbol text not null,
  name text,
  currency text,
  quantity numeric,
  market_price numeric,
  book_value_cad numeric,
  market_value_cad numeric,
  as_of date,
  created_at timestamptz not null default now(),
  unique (household_id, account_number, symbol)
);
alter table holdings enable row level security;

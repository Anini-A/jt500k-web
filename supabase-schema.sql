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

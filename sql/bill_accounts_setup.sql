-- ── Multiple bill accounts (Home & Utilities, Transpo, …) ───────────────
-- Run once in the Supabase SQL Editor. Turns the single implicit account into a
-- proper `bill_accounts` table and attaches every bill to an account.

create table if not exists bill_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  current_balance numeric(12,2) default 0,
  balance_as_of date,
  buffer numeric(12,2) default 0,
  sort int default 0,
  created_at timestamptz default now()
);

alter table bills add column if not exists account_id uuid references bill_accounts(id) on delete cascade;

-- Seed the first account from the old single bill_settings row (only if none exist yet)
insert into bill_accounts (household_id, name, current_balance, balance_as_of, buffer, sort)
select household_id, 'Home & Utilities', current_balance, balance_as_of, buffer, 0
from bill_settings
where not exists (select 1 from bill_accounts);

-- Fallback: if there was no bill_settings row, still create a default account
insert into bill_accounts (household_id, name, current_balance, balance_as_of, buffer, sort)
select (select id from households order by created_at limit 1), 'Home & Utilities', 0, current_date, 0, 0
where not exists (select 1 from bill_accounts);

-- Attach every existing bill to the first account
update bills set account_id = (select id from bill_accounts order by created_at, sort limit 1)
where account_id is null;

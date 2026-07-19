-- ── Bill Runway: schema + seed ─────────────────────────────────────────
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent-ish).

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  day int not null check (day between 1 and 31),
  amount numeric(12,2) not null,
  quarterly boolean default false,
  next_due date,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists bill_settings (
  household_id uuid primary key references households(id) on delete cascade,
  current_balance numeric(12,2) default 0,
  balance_as_of date,
  deposit_day int default 28 check (deposit_day between 1 and 31),
  deposit_amount numeric(12,2) default 0,
  buffer numeric(12,2) default 0,
  updated_at timestamptz default now()
);

-- Seed the 11 recurring bills (ranged bills use their EARLIEST day = worst-case safe).
-- Only seeds if the table is empty, so re-running won't duplicate.
insert into bills (household_id, name, day, amount, quarterly, next_due)
select (select id from households order by created_at limit 1), v.name, v.day, v.amount, v.quarterly, v.next_due
from (values
  ('Property tax (TIPP)',            1,  264.00, false, null::date),
  ('Loan payment (1 of 2)',          2,  141.33, false, null),
  ('Koodo Mobile',                   2,   40.00, false, null),
  ('Shaw Cable TV',                  6,   56.00, false, null),
  ('Manitoba Hydro',                 8,  268.52, false, null),
  ('Mastercard autopay (insurance)', 9,   52.43, false, null),
  ('Mortgage',                      15, 1260.19, false, null),
  ('Mortgage insurance',            15,  123.74, false, null),
  ('Water bill',                    15,  432.64, true,  '2026-08-15'),  -- ← set to the real next quarterly date
  ('Loan payment (2 of 2)',         17,  141.33, false, null),
  ('Fido Mobile',                   20,  104.18, false, null)
) as v(name, day, amount, quarterly, next_due)
where not exists (select 1 from bills);

-- Seed default account settings (edit balance/deposit in the app afterward).
insert into bill_settings (household_id, current_balance, balance_as_of, deposit_day, deposit_amount, buffer)
select (select id from households order by created_at limit 1), 0, current_date, 28, 2451.36, 0
on conflict (household_id) do nothing;

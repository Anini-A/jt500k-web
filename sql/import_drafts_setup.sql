-- ── Smart Import: managed cards + saved drafts ─────────────────────────
-- Run once in the Supabase SQL Editor (already applied on the live project).
-- Powers the Add → Import flow: paste a raw bank/card dump, format it with AI,
-- save it as a draft (synced across phone + desktop), then log when you pay.

-- Your credit cards, for tagging pasted rows and showing per-card subtotals.
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Formatted-but-not-yet-logged transactions.
-- rows = jsonb array of { date, description, category, type, amount, card }
create table if not exists import_drafts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text,
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists import_drafts_household_idx on import_drafts(household_id, updated_at desc);

-- Row Level Security: lock these down like every other table. The app's
-- server (API routes) uses the service-role key, which bypasses RLS.
-- No public/anon access.
alter table cards enable row level security;
alter table import_drafts enable row level security;

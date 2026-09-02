-- ── Remember which credit card a transaction was charged to ─────────────
-- Run once in the Supabase SQL Editor.
--
-- Imported rows carry a card while they sit in a draft, but the card was dropped
-- at log time, so once logged there was no way to tell what a charge was paid with.
--
-- Mirrors how categories are already stored on transactions: the id for joins, plus
-- the name denormalised so the association survives the card being renamed or deleted
-- (the FK nulls out on delete; the text stays).
--
-- Additive and nullable: existing rows are untouched and read as "no card". They
-- cannot be backfilled — the information was never recorded for them.

alter table transactions
  add column if not exists card_id uuid references cards(id) on delete set null,
  add column if not exists card text;

create index if not exists transactions_card_id_idx on transactions(card_id);

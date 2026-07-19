-- ── Dismissed action items (server-side, cross-device) ──────────────────
-- Run once in the Supabase SQL Editor. Replaces the old browser-localStorage
-- dismiss list so a dismissal syncs across phone + desktop and survives a
-- browser reset. Only "Good to know" info items and recurring "skip" land here;
-- real to-dos are never dismissible.

create table if not exists dismissed_notifs (
  household_id uuid references households(id) on delete cascade,
  notif_id text not null,
  created_at timestamptz default now(),
  primary key (household_id, notif_id)
);

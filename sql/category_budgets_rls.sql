-- category_budgets was the one public table left without Row-Level Security,
-- so anyone holding the (public) project URL and anon key could read and write
-- it. Every other table in this project already has RLS enabled with no
-- policies: the app reaches Supabase only from server-side API routes using the
-- service-role key, which bypasses RLS, so "enabled, zero policies" is the
-- correct posture — it denies all anon/authenticated access while the app is
-- unaffected. Applied as migration enable_rls_on_category_budgets.
alter table public.category_budgets enable row level security;

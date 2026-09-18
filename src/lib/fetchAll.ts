import { supabaseAdmin } from '@/lib/supabase'

const PAGE_SIZE = 1000

/**
 * Read every row of a table. PostgREST caps a plain .select() at 1000 rows and
 * returns the truncated page WITHOUT an error, which silently skewed every
 * whole-history total once the transactions table grew past 1000 rows.
 * Always use this for full-table aggregates.
 */
export async function fetchAllRows<T = any>(
  table: string,
  columns: string,
  refine?: (q: any) => any,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabaseAdmin.from(table).select(columns)
    if (refine) q = refine(q)
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as T[]
    all.push(...page)
    if (page.length < PAGE_SIZE) return all
  }
}

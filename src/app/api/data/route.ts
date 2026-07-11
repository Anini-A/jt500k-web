import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Returns all transactions (lightweight) so the dashboard can filter and
// aggregate instantly on the client without re-hitting the server.
export async function GET() {
  const pageSize = 1000
  let from = 0
  const all: any[] = []

  // paginate to be safe if data grows beyond 1000 rows
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('id, date, type, category, description, amount')
      .order('date', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    all.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }

  return NextResponse.json(all, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

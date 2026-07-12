import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { AUTH_COOKIE, sitePassword, tokenFor } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// GET /api/export — complete snapshot of every table (backup/restore).
// Allowed if the caller is logged in (cookie) OR passes ?token=BACKUP_TOKEN
// (so an automated Google Apps Script / cron can fetch it).
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  const pw = sitePassword()
  const cookie = req.cookies.get(AUTH_COOKIE)?.value
  const authed = !pw || (cookie ? cookie === (await tokenFor(pw)) : false)
  const tokenOk = !!process.env.BACKUP_TOKEN && token === process.env.BACKUP_TOKEN
  if (!authed && !tokenOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tables = ['households', 'users', 'categories', 'transactions', 'budgets', 'debts', 'holdings'] as const
  const out: Record<string, any> = { app: 'jt500k', version: 1, exportedAt: new Date().toISOString() }
  const counts: Record<string, number> = {}
  for (const t of tables) {
    const { data, error } = await supabaseAdmin.from(t).select('*')
    if (error) return NextResponse.json({ error: `${t}: ${error.message}` }, { status: 500 })
    out[t] = data ?? []
    counts[t] = (data ?? []).length
  }
  out.counts = counts
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}

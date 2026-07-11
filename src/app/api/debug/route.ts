import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// TEMP diagnostic: computes the SAME aggregations the charts use, server-side,
// so we can see what production actually produces. Remove after debugging.
export async function GET() {
  // mimic /api/data (what dashboard charts aggregate)
  const { data: txns } = await supabaseAdmin
    .from('transactions').select('date, type, category, amount').order('date', { ascending: true })

  const rows = txns ?? []
  const latest = rows.reduce((mx, t) => (t.date as string) > mx ? (t.date as string) : mx, '0000-00')
  const latestMonth = latest.slice(0, 7)

  const allExpenseByCat: Record<string, number> = {}
  const monthExpenseByCat: Record<string, number> = {}
  let utilities = 0, debt = 0
  for (const t of rows) {
    if (t.type !== 'expense') continue
    const c = t.category || 'Uncategorized'
    allExpenseByCat[c] = (allExpenseByCat[c] || 0) + Number(t.amount)
    if ((t.date as string).slice(0, 7) === latestMonth) monthExpenseByCat[c] = (monthExpenseByCat[c] || 0) + Number(t.amount)
    if (c === 'Utilities') utilities += Number(t.amount)
    if (c === 'Debt Repayment') debt += Number(t.amount)
  }
  const top = Object.entries(allExpenseByCat).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, v]) => `${k}: $${Math.round(v)}`)

  return NextResponse.json({
    latestMonth,
    transactionCount: rows.length,
    utilitiesTotal: Math.round(utilities),
    debtRepaymentTotal: Math.round(debt),
    topExpenseCategories: top,
    thisMonthByCategory: Object.fromEntries(Object.entries(monthExpenseByCat).map(([k, v]) => [k, Math.round(v)])),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

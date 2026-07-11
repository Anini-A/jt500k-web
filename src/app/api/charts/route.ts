import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('type, amount, date, category')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // --- monthly series: income / expense / savings per YYYY-MM ---
  const byMonth = new Map<
    string,
    { month: string; income: number; expense: number; savings: number }
  >()
  // --- expense totals by category ---
  const byCategory = new Map<string, number>()

  for (const t of data ?? []) {
    const amt = Number(t.amount) || 0
    const month = (t.date as string).slice(0, 7) // YYYY-MM

    if (!byMonth.has(month)) {
      byMonth.set(month, { month, income: 0, expense: 0, savings: 0 })
    }
    const m = byMonth.get(month)!
    if (t.type === 'income') m.income += amt
    else if (t.type === 'expense') m.expense += amt
    else if (t.type === 'savings') m.savings += amt

    if (t.type === 'expense' && t.category) {
      byCategory.set(t.category, (byCategory.get(t.category) || 0) + amt)
    }
  }

  const monthly = [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      ...m,
      income: Math.round(m.income),
      expense: Math.round(m.expense),
      savings: Math.round(m.savings),
      net: Math.round(m.income - m.expense - m.savings),
    }))

  const categories = [...byCategory.entries()]
    .map(([name, total]) => ({ name, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ monthly, categories }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// Returns a summary for the most recent month that has data.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('type, amount, date, category')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const txns = data ?? []
  if (txns.length === 0) return NextResponse.json({ empty: true })

  // latest month present in the data
  const latest = txns.reduce((mx, t) => {
    const m = (t.date as string).slice(0, 7)
    return m > mx ? m : mx
  }, '0000-00')

  // previous calendar month (for month-over-month deltas)
  const [ly, lm] = latest.split('-').map(Number)
  const prevD = new Date(ly, lm - 2) // lm is 1-based; -2 → previous month
  const prevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`

  let income = 0, expense = 0, savings = 0
  let prevIncome = 0, prevExpense = 0, prevSavings = 0
  const byCat = new Map<string, number>()
  for (const t of txns) {
    const m = (t.date as string).slice(0, 7)
    const amt = Number(t.amount) || 0
    if (m === prevMonth) {
      if (t.type === 'income') prevIncome += amt
      else if (t.type === 'expense') prevExpense += amt
      else if (t.type === 'savings') prevSavings += amt
      continue
    }
    if (m !== latest) continue
    if (t.type === 'income') income += amt
    else if (t.type === 'expense') {
      expense += amt
      if (t.category) byCat.set(t.category, (byCat.get(t.category) || 0) + amt)
    } else if (t.type === 'savings') savings += amt
  }

  const [y, mo] = latest.split('-')
  const label = new Date(Number(y), Number(mo) - 1).toLocaleString('en', {
    month: 'long', year: 'numeric',
  })

  const categories = [...byCat.entries()]
    .map(([name, total]) => ({ name, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    month: latest,
    label,
    income: Math.round(income),
    expense: Math.round(expense),
    savings: Math.round(savings),
    net: Math.round(income - expense - savings),
    prevIncome: Math.round(prevIncome),
    prevExpense: Math.round(prevExpense),
    prevSavings: Math.round(prevSavings),
    categories,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

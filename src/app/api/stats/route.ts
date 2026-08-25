import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('type, amount, date')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let totalIncome = 0
  let totalExpenses = 0
  let totalSavings = 0
  let asOf = ''

  for (const t of data ?? []) {
    if (t.date > asOf) asOf = t.date as string
  }
  const curMonth = asOf.slice(0, 7) // the latest tracking month present in the data

  let monthIncome = 0, monthExpense = 0, monthSavings = 0
  for (const t of data ?? []) {
    const amt = Number(t.amount) || 0
    if (t.type === 'income') totalIncome += amt
    else if (t.type === 'expense') totalExpenses += amt
    else if (t.type === 'savings') totalSavings += amt
    if ((t.date as string).slice(0, 7) === curMonth) {
      if (t.type === 'income') monthIncome += amt
      else if (t.type === 'expense') monthExpense += amt
      else if (t.type === 'savings') monthSavings += amt
    }
  }

  const savingsRate =
    totalIncome > 0 ? Math.round((totalSavings / totalIncome) * 100) : 0

  // Cash on hand: money in, minus money spent, minus money moved to savings.
  const currentBalance = totalIncome - totalExpenses - totalSavings
  // How much the cash balance moved THIS tracking month (its exact contribution to the balance)
  const monthChange = Math.round((monthIncome - monthExpense - monthSavings) * 100) / 100

  return NextResponse.json({
    totalIncome,
    totalExpenses,
    totalSavings,
    savingsRate,
    currentBalance,
    monthChange,
    asOf,
    transactionCount: data?.length ?? 0,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

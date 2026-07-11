import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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

  for (const t of data ?? []) {
    const amt = Number(t.amount) || 0
    if (t.type === 'income') totalIncome += amt
    else if (t.type === 'expense') totalExpenses += amt
    else if (t.type === 'savings') totalSavings += amt
  }

  const savingsRate =
    totalIncome > 0 ? Math.round((totalSavings / totalIncome) * 100) : 0

  return NextResponse.json({
    totalIncome,
    totalExpenses,
    totalSavings,
    savingsRate,
    transactionCount: data?.length ?? 0,
  })
}

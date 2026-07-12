import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const norm = (s: string | null) => (s || '').trim().toLowerCase()

// GET /api/networth — current net worth (Investments + Cash − Debts), records a
// snapshot for the current calendar month, and returns the monthly history.
export async function GET() {
  const { data: hh } = await supabaseAdmin.from('households').select('id').order('created_at').limit(1).maybeSingle()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })

  // investments (Wealthsimple holdings) + cash/other (manual assets)
  const { data: holds } = await supabaseAdmin.from('holdings').select('market_value_cad')
  const { data: manual } = await supabaseAdmin.from('manual_assets').select('value_cad')
  const holdingsValue = (holds ?? []).reduce((s, h) => s + Number(h.market_value_cad), 0)
  const cashValue = (manual ?? []).reduce((s, a) => s + Number(a.value_cad), 0)

  // debts remaining = amount − payments (category 'Debt Repayment', desc matches debt name)
  const { data: debts } = await supabaseAdmin.from('debts').select('name, amount')
  const { data: pays } = await supabaseAdmin.from('transactions').select('description, amount').eq('category', 'Debt Repayment')
  const paidByName = new Map<string, number>()
  for (const p of pays ?? []) paidByName.set(norm(p.description), (paidByName.get(norm(p.description)) || 0) + Number(p.amount))
  const debtsRemaining = (debts ?? []).reduce((s, d) => s + Math.max(0, Number(d.amount) - (paidByName.get(norm(d.name)) || 0)), 0)

  const investments = Math.round((holdingsValue + cashValue) * 100) / 100
  const debtsTotal = Math.round(debtsRemaining * 100) / 100
  const netWorth = Math.round((holdingsValue + cashValue - debtsRemaining) * 100) / 100
  const month = new Date().toISOString().slice(0, 7)

  // upsert this month's snapshot (keeps the current month live, freezes past months)
  await supabaseAdmin.from('net_worth_snapshots').upsert(
    { household_id: hh.id, month, investments, cash: Math.round(cashValue * 100) / 100, debts: debtsTotal, net_worth: netWorth },
    { onConflict: 'household_id,month' },
  )

  const { data: snaps } = await supabaseAdmin.from('net_worth_snapshots').select('month, net_worth, investments, debts').order('month')
  const history = (snaps ?? []).map((s) => ({ month: s.month, net: Math.round(Number(s.net_worth)), investments: Math.round(Number(s.investments)), debts: Math.round(Number(s.debts)) }))

  return NextResponse.json({
    month,
    holdingsValue: Math.round(holdingsValue * 100) / 100,
    cashValue: Math.round(cashValue * 100) / 100,
    debts: debtsTotal,
    netWorth,
    history,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { indexMonthlyReturns, reconstructHistory, type MonthlyFlow } from '@/lib/backfill'

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
  const { data: holds } = await supabaseAdmin.from('holdings').select('market_value_cad, book_value_cad')
  const { data: manual } = await supabaseAdmin.from('manual_assets').select('value_cad')
  const holdingsValue = (holds ?? []).reduce((s, h) => s + Number(h.market_value_cad), 0)
  const cashValue = (manual ?? []).reduce((s, a) => s + Number(a.value_cad), 0)

  // real investment return = market − book (cost), from the uploaded holdings CSVs.
  // Only positions that carry a book value count, so the $ and % stay consistent.
  let withBookMkt = 0, withBookCost = 0
  for (const h of holds ?? []) {
    const cost = Number(h.book_value_cad) || 0
    if (cost > 0) { withBookMkt += Number(h.market_value_cad) || 0; withBookCost += cost }
  }
  const investGain = Math.round((withBookMkt - withBookCost) * 100) / 100
  const investCost = Math.round(withBookCost * 100) / 100
  const investReturnPct = withBookCost > 0 ? Math.round((investGain / withBookCost) * 1000) / 10 : null

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

  // Real monthly history — the 1-year Wealthsimple series (rebased to this app's
  // basis) plus the app's own ongoing snapshots.
  const { data: snaps } = await supabaseAdmin.from('net_worth_snapshots').select('month, net_worth, investments, cash, debts').order('month')
  const realHistory = (snaps ?? []).map((s) => ({ month: s.month as string, net: Math.round(Number(s.net_worth)), investments: Math.round(Number(s.investments)), debts: Math.round(Number(s.debts)), est: false }))

  // Estimated pre-history: months BEFORE the earliest real snapshot, back to the
  // first transaction — so "All" truly reaches inception.
  let estimated: { month: string; net: number; est: true }[] = []
  try {
    if (snaps && snaps.length) {
      const { data: txns } = await supabaseAdmin.from('transactions').select('type, amount, date, category')
      const rows = txns ?? []
      if (rows.length) {
        const flows = new Map<string, MonthlyFlow>()
        let earliestTx = '9999-99'
        for (const t of rows) {
          const m = (t.date as string).slice(0, 7)
          if (m < earliestTx) earliestTx = m
          if (!flows.has(m)) flows.set(m, { income: 0, expense: 0, savings: 0, debtRepay: 0 })
          const f = flows.get(m)!
          const amt = Number(t.amount) || 0
          if (t.type === 'income') f.income += amt
          else if (t.type === 'savings') f.savings += amt
          else if (t.type === 'expense') { f.expense += amt; if (t.category === 'Debt Repayment') f.debtRepay += amt }
        }
        const anchor = snaps[0] // earliest real snapshot
        const anchorMonth = anchor.month as string
        const anchorCash = Number(anchor.cash) || 0
        const anchorHoldings = (Number(anchor.investments) || Number(anchor.net_worth)) - anchorCash
        const anchorDebts = Number(anchor.debts) || 0
        if (earliestTx < anchorMonth) {
          const idxReturns = await indexMonthlyReturns()
          estimated = reconstructHistory({ startMonth: earliestTx, anchorMonth, anchorHoldings, anchorCash, anchorDebts, flows, idxReturns })
        }
      }
    }
  } catch { /* estimate is best-effort */ }

  const history = [...estimated, ...realHistory]

  return NextResponse.json({
    month,
    holdingsValue: Math.round(holdingsValue * 100) / 100,
    cashValue: Math.round(cashValue * 100) / 100,
    debts: debtsTotal,
    netWorth,
    investGain,
    investCost,
    investReturnPct,
    history,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

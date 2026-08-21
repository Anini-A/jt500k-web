import { supabaseAdmin } from '@/lib/supabase'

const norm = (s: string | null) => (s || '').trim().toLowerCase()

// Net worth = Investments (holdings) + Cash/other (manual assets) − Debts remaining.
// Shared so both /api/networth and the holdings upload compute it the same way.
export async function computeNetWorth() {
  const { data: holds } = await supabaseAdmin.from('holdings').select('market_value_cad')
  const { data: manual } = await supabaseAdmin.from('manual_assets').select('value_cad')
  const holdingsValue = (holds ?? []).reduce((s, h) => s + Number(h.market_value_cad), 0)
  const cashValue = (manual ?? []).reduce((s, a) => s + Number(a.value_cad), 0)

  const { data: debts } = await supabaseAdmin.from('debts').select('name, amount')
  const { data: pays } = await supabaseAdmin.from('transactions').select('description, amount').eq('category', 'Debt Repayment')
  const paidByName = new Map<string, number>()
  for (const p of pays ?? []) paidByName.set(norm(p.description), (paidByName.get(norm(p.description)) || 0) + Number(p.amount))
  const debtsRemaining = (debts ?? []).reduce((s, d) => s + Math.max(0, Number(d.amount) - (paidByName.get(norm(d.name)) || 0)), 0)

  const round = (n: number) => Math.round(n * 100) / 100
  return {
    investments: round(holdingsValue + cashValue),
    holdingsValue: round(holdingsValue),
    cashValue: round(cashValue),
    debts: round(debtsRemaining),
    netWorth: round(holdingsValue + cashValue - debtsRemaining),
  }
}

// Upsert a net-worth snapshot for the given YYYY-MM month.
export async function saveSnapshot(householdId: string, month: string) {
  const nw = await computeNetWorth()
  await supabaseAdmin.from('net_worth_snapshots').upsert(
    { household_id: householdId, month, investments: nw.investments, cash: nw.cashValue, debts: nw.debts, net_worth: nw.netWorth },
    { onConflict: 'household_id,month' },
  )
  return nw
}

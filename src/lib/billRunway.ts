// Shared bill-runway projection — used by the notification bell and the daily cron.
// Finds the lowest projected balance in the Home & Utilities account BEFORE the
// next paycheck deposit, so we can warn before a bill bounces.

export interface BillRow { name: string; day: number; amount: number; quarterly?: boolean; next_due?: string | null; active?: boolean }
export interface BillSettings { current_balance?: number; balance_as_of?: string | null; deposit_day?: number; deposit_amount?: number; buffer?: number }
export interface Trough { balance: number; iso: string; label: string }

const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export function billTrough(bills: BillRow[], s: BillSettings): Trough | null {
  const active = (bills || []).filter((b) => b.active !== false)
  if (!active.length) return null
  const today = strip(new Date())
  const startRaw = strip(new Date((s.balance_as_of || today.toISOString().slice(0, 10)) + 'T00:00:00'))
  const from = startRaw < today ? today : startRaw
  // No deposits in the model — the balance only drains. Walk ~one billing cycle and
  // report the point where it first drops below the buffer (i.e. runs short).
  const DAYS = 35
  const buffer = Number(s.buffer) || 0
  let bal = Number(s.current_balance) || 0
  let trough: { balance: number; date: Date } | null = null
  let firstShort: { balance: number; date: Date } | null = null
  for (let i = 0; i <= DAYS; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
    for (const b of active) {
      let hit = false
      if (b.quarterly && b.next_due) {
        const occ = strip(new Date(b.next_due + 'T00:00:00'))
        for (let k = 0; k < 24; k++) {
          const q = new Date(occ.getFullYear(), occ.getMonth() + k * 3, occ.getDate())
          if (q > d) break
          if (q.getTime() === d.getTime()) { hit = true; break }
        }
      } else if (!b.quarterly && d.getDate() === Number(b.day)) hit = true
      if (hit) {
        bal -= Number(b.amount)
        if (!firstShort && bal < buffer) firstShort = { balance: bal, date: d }
        if (!trough || bal < trough.balance) trough = { balance: bal, date: d }
      }
    }
  }
  // report the first-shortfall day (most actionable); fall back to the lowest point
  trough = firstShort || trough
  if (!trough) return null
  return {
    balance: Math.round(trough.balance),
    iso: trough.date.toISOString().slice(0, 10),
    label: trough.date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
  }
}

// How much you'd need to top up to stay above the safety floor. 0 = covered.
export function shortfall(bills: BillRow[], s: BillSettings): { short: number; trough: Trough } | null {
  const t = billTrough(bills, s)
  if (!t) return null
  const buffer = Number(s.buffer) || 0
  return { short: Math.max(0, buffer - t.balance), trough: t }
}

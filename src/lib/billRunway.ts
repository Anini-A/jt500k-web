// Shared bill-runway projection — used by the notification bell and the daily cron.
// Finds the lowest projected balance in the Home & Utilities account BEFORE the
// next paycheck deposit, so we can warn before a bill bounces.

import { ymd } from './date'

export interface BillRow { name: string; day: number; amount: number; quarterly?: boolean; next_due?: string | null; active?: boolean }
export interface BillSettings { current_balance?: number; balance_as_of?: string | null; deposit_day?: number; deposit_amount?: number; buffer?: number }
export interface Trough { balance: number; iso: string; label: string }

const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()

function nextDateForDay(from: Date, day: number): Date {
  const inThis = new Date(from.getFullYear(), from.getMonth(), Math.min(day, daysInMonth(from.getFullYear(), from.getMonth())))
  if (inThis >= strip(from)) return inThis
  const y = from.getFullYear(), m = from.getMonth() + 1
  return new Date(y, m, Math.min(day, daysInMonth(y, m)))
}

// Every date a bill lands on between `from` and `horizon` (inclusive) — monthly by
// day-of-month (clamped for short months), or quarterly stepping from next_due.
export function occurrencesUpTo(bill: BillRow, from: Date, horizon: Date): Date[] {
  const out: Date[] = []
  if (bill.quarterly) {
    if (!bill.next_due) return out
    const base = strip(new Date(bill.next_due + 'T00:00:00'))
    for (let k = 0; k < 40; k++) {
      const d = new Date(base.getFullYear(), base.getMonth() + k * 3, base.getDate())
      if (d < from) continue
      if (d > horizon) break
      out.push(d)
    }
    return out
  }
  let d = nextDateForDay(from, bill.day)
  while (d <= horizon) {
    out.push(d)
    const ny = d.getFullYear(), nm = d.getMonth() + 1
    d = new Date(ny, nm, Math.min(bill.day, daysInMonth(ny, nm)))
  }
  return out
}

// How far out the forecast looks: the end of NEXT month, so next-month bills stay visible
// even from the last days of this one.
export const forecastHorizon = (from: Date) => new Date(from.getFullYear(), from.getMonth() + 2, 0)

// The date this account's balance stops covering its bills.
//
// Coverage is monotonic — the model only ever drains, so once the running balance dips
// below the buffer it never recovers. That makes coverage a single cutoff DATE rather than
// a per-bill property: every occurrence on or before it is funded, everything after isn't.
// Returns null when even the first upcoming bill is already short.
export function coveredThrough(bills: BillRow[], s: BillSettings): string | null {
  const active = (bills || []).filter((b) => b.active !== false)
  if (!active.length) return null
  const today = strip(new Date())
  const startRaw = strip(new Date((s.balance_as_of || ymd(today)) + 'T00:00:00'))
  const from = startRaw < today ? today : startRaw // never project into the past
  const horizon = forecastHorizon(from)
  const upcoming = active
    .flatMap((b) => occurrencesUpTo(b, from, horizon).map((date) => ({ b, date })))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  const buffer = Number(s.buffer) || 0
  let bal = Number(s.current_balance) || 0
  let last: Date | null = null
  for (const { b, date } of upcoming) {
    bal = Math.round((bal - Number(b.amount)) * 100) / 100
    if (bal < buffer) break
    last = date
  }
  return last ? ymd(last) : null
}

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

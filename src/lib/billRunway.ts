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

// The forecast window: the NEXT occurrence of each bill, once each — roughly 3-4.5 weeks
// depending on how the due days fall.
//
// Counting one cycle keeps the total directly comparable to a month's income. A fixed
// calendar horizon (we used "end of next month") catches most bills twice and silently
// changes meaning as the month advances; a fixed day count (28/35) either drops bills whose
// due day sits just past the edge or double-counts the ones near it. One-of-each avoids
// both, at the cost of a window that breathes a few days — which is why the card prints
// the date range rather than a "next N weeks" label.
export function nextOccurrences(bills: BillRow[], from: Date): { b: BillRow; date: Date }[] {
  const out: { b: BillRow; date: Date }[] = []
  for (const b of bills) {
    if (b.quarterly) {
      if (!b.next_due) continue
      let d = strip(new Date(b.next_due + 'T00:00:00'))
      let guard = 0
      while (d < from && guard++ < 40) d = new Date(d.getFullYear(), d.getMonth() + 3, d.getDate())
      if (d >= from) out.push({ b, date: d })
      continue
    }
    out.push({ b, date: nextDateForDay(from, b.day) })
  }
  return out.sort((x, y) => x.date.getTime() - y.date.getTime())
}

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
  const upcoming = nextOccurrences(active, from)

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

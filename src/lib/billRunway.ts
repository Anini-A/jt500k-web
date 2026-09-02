// Shared bill-runway projection — the single source of truth for bill coverage, used by
// the Bills tab, the Home card, the notification bell/cron and the chat assistant.
// No deposits are modeled: the balance only drains.

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
export function nextOccurrences<T extends BillRow>(bills: T[], from: Date): { b: T; date: Date }[] {
  const out: { b: T; date: Date }[] = []
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

export interface CycleEvent<T extends BillRow = BillRow> {
  bill: T; date: Date; iso: string; name: string; amount: number
  balanceAfter: number
  covered: boolean          // the balance still cleared the buffer after paying it
}
export interface Cycle<T extends BillRow = BillRow> {
  timeline: CycleEvent<T>[]
  startBalance: number
  buffer: number
  coveredCount: number
  coveredThroughISO: string | null // last date the balance still covers; null = short from the first bill
  firstShort: CycleEvent<T> | null
  remainingCount: number
  remainingTotal: number    // FACE VALUE of the bills that aren't covered
  short: number             // CASH needed to clear the cycle — less than remainingTotal, because
                            // whatever is left in the account still goes toward the first short bill.
                            // This is the "top up N" number; remainingTotal is "those bills total N".
  horizonISO: string        // furthest bill in the cycle
}

// The one bill-coverage model: drain the balance through one cycle of bills, in date order.
//
// Coverage is monotonic — nothing is ever added back — so once the running balance dips below
// the buffer it never recovers. That makes coverage a single cutoff DATE rather than a per-bill
// property: every bill on or before it is funded, everything after isn't.
export function projectCycle<T extends BillRow>(bills: T[], s: BillSettings): Cycle<T> {
  const active = (bills || []).filter((b) => b.active !== false)
  const today = strip(new Date())
  const startRaw = strip(new Date((s.balance_as_of || ymd(today)) + 'T00:00:00'))
  const from = startRaw < today ? today : startRaw // never project into the past
  const upcoming = nextOccurrences(active, from)

  const buffer = Number(s.buffer) || 0
  const startBalance = Number(s.current_balance) || 0
  let bal = startBalance
  const timeline: CycleEvent<T>[] = []
  let coveredCount = 0, coveredThroughISO: string | null = null
  let firstShort: CycleEvent<T> | null = null
  let remainingCount = 0, remainingTotal = 0

  for (const { b, date } of upcoming) {
    bal = Math.round((bal - Number(b.amount)) * 100) / 100
    const covered = bal >= buffer
    const ev: CycleEvent<T> = { bill: b, date, iso: ymd(date), name: b.name, amount: Number(b.amount), balanceAfter: bal, covered }
    if (covered) { coveredCount++; coveredThroughISO = ev.iso }
    else { remainingCount++; remainingTotal = Math.round((remainingTotal + ev.amount) * 100) / 100; if (!firstShort) firstShort = ev }
    timeline.push(ev)
  }

  return {
    timeline, startBalance, buffer, coveredCount, coveredThroughISO, firstShort,
    remainingCount, remainingTotal,
    short: Math.max(0, Math.round((buffer - bal) * 100) / 100),
    horizonISO: ymd(timeline.length ? timeline[timeline.length - 1].date : from),
  }
}

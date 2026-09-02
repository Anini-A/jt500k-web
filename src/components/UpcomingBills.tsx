'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON, cachedValue } from '@/lib/fresh'
import { today, ymd } from '@/lib/date'
import { projectCycle } from '@/lib/billRunway'
import { TriangleAlert } from 'lucide-react'
import LoadError from './LoadError'

interface Bill { id: string; account_id: string | null; name: string; day: number; amount: number; quarterly?: boolean; next_due?: string | null }
interface Account { id: string; name: string; current_balance?: number; balance_as_of?: string | null; buffer?: number }
interface BillsResp { bills: Bill[]; accounts: Account[] }

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const HORIZON = 14 // "next 2 weeks"
const ROW_H = 38   // one bill row (9px padding × 2 + line + border) — 5 of them sets the scroll height
const fmtDay = (d: Date) => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

// Next time this bill lands on/after `from`: monthly on its day-of-month (clamped to
// short months), or quarterly stepping forward from next_due.
function nextOccurrence(b: Bill, from: Date): Date | null {
  if (b.quarterly) {
    if (!b.next_due) return null
    let d = strip(new Date(b.next_due + 'T00:00:00'))
    let guard = 0
    while (d < from && guard++ < 40) d = new Date(d.getFullYear(), d.getMonth() + 3, d.getDate())
    return d
  }
  const inThis = new Date(from.getFullYear(), from.getMonth(), Math.min(b.day, daysInMonth(from.getFullYear(), from.getMonth())))
  if (inThis >= from) return inThis
  const y = from.getFullYear(), m = from.getMonth() + 1
  return new Date(y, m, Math.min(b.day, daysInMonth(y, m)))
}

// Compact "what's due next" list for Home — pulls from the same bills the Bills tab uses.
export default function UpcomingBills() {
  const [data, setData] = useState<BillsResp | null>(() => cachedValue<BillsResp>('/api/bills'))
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    getJSON('/api/bills')
      .then((d) => { if (d && !d.error) { setData(d); setError(false) } else setError(!cachedValue('/api/bills')); setLoaded(true) })
      .catch(() => { setError(!cachedValue('/api/bills')); setLoaded(true) })
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const bills = data?.bills ?? []
  const accounts = data?.accounts ?? []
  const acctName = (id: string | null) => accounts.find((a) => a.id === id)?.name

  const from = strip(new Date(today() + 'T00:00:00'))
  const upcoming = bills
    .map((b) => { const nd = nextOccurrence(b, from); return nd ? { b, date: nd, days: Math.round((strip(nd).getTime() - from.getTime()) / 86400000) } : null })
    .filter((x): x is { b: Bill; date: Date; days: number } => x !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  // Nothing to show / still cold-loading with no cache → render nothing (keep Home clean)
  if (!data && !loaded) return null
  if (error && !bills.length) return (
    <div className="card glass"><span className="hdr-label">Upcoming bills</span><LoadError onRetry={() => { setError(false); load() }} label="Couldn't load bills" compact /></div>
  )
  if (!bills.length) return null

  const within = upcoming.filter((u) => u.days <= HORIZON)
  const totalSoon = within.reduce((s, u) => s + Number(u.b.amount), 0)
  // the list matches the headline total: every bill inside the window, not an arbitrary
  // first-5 that could run past it. Falls back to the next few when the window is empty.
  const rows = within.length ? within : upcoming.slice(0, 3)
  const horizonEnd = new Date(from.getFullYear(), from.getMonth(), from.getDate() + HORIZON)
  const goBills = () => { try { localStorage.setItem('jt-dash-tab', 'bills') } catch { /* ignore */ } }

  // Coverage: one shared projection per account (same engine the Bills tab renders), so the
  // banner, the row colours and the Bills tab can't disagree. Accounts with no tracked
  // balance are skipped — no false alarms, and their bills stay neutral rather than being
  // coloured green on no evidence.
  const tracked = accounts.filter((a) => Number(a.current_balance) > 0 || a.balance_as_of)
  const cycles = new Map<string, ReturnType<typeof projectCycle<Bill>>>()
  for (const a of tracked) {
    const ab = bills.filter((b) => b.account_id === a.id)
    if (ab.length) cycles.set(a.id, projectCycle(ab, { current_balance: a.current_balance, balance_as_of: a.balance_as_of, buffer: a.buffer }))
  }
  const shorts = [...cycles.entries()]
    .map(([id, c]) => {
      const name = accounts.find((a) => a.id === id)?.name ?? ''
      // `short` (cash to clear the cycle), not the face value of the unpaid bills — whatever
      // is left in the account still goes toward the first one.
      return c.short > 0 && c.firstShort ? { name, short: c.short, from: c.firstShort.iso, through: c.coveredThroughISO } : null
    })
    .filter((x): x is { name: string; short: number; from: string; through: string | null } => x !== null)
    .sort((a, b) => b.short - a.short)
  const hasCoverage = tracked.some((a) => bills.some((b) => b.account_id === a.id))
  const worst = shorts[0]

  const coverageOf = (u: { b: Bill; date: Date }): 'covered' | 'short' | 'unknown' => {
    if (!u.b.account_id || !cycles.has(u.b.account_id)) return 'unknown'
    const cut = cycles.get(u.b.account_id)!.coveredThroughISO
    return cut && ymd(u.date) <= cut ? 'covered' : 'short'
  }
  const firstShortIdx = rows.findIndex((u) => coverageOf(u) === 'short')

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span className="hdr-label">Upcoming bills</span>
      {within.length > 0 && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
          <b style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{money(totalSoon)}</b> · {fmtDay(from)} → {fmtDay(horizonEnd)}
        </span>
      )}
    </div>
  )

  return (
    <div className="card glass">
      {/* Header taps to Bills only when there's no coverage card to carry the tap */}
      {hasCoverage ? header : <a href="/dashboard" onClick={goBills} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{header}</a>}

      {/* Coverage — a thin tinted card, clickable through to the Bills tab. Red when an
          account runs short (standard --expense), green when covered. */}
      {hasCoverage && (
        <a href="/dashboard" onClick={goBills}
          style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '8px 11px', borderRadius: 10, fontSize: 12, fontWeight: 600, textDecoration: 'none',
            color: worst ? 'var(--expense)' : 'var(--income)',
            background: worst ? 'color-mix(in srgb, var(--expense) 12%, transparent)' : 'color-mix(in srgb, var(--income) 10%, transparent)' }}>
          {worst && <TriangleAlert size={13} style={{ flexShrink: 0 }} />}
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{worst
            ? <>{worst.name} covers bills to {worst.through ? fmtDay(new Date(worst.through + 'T00:00:00')) : '—'} · {money(worst.short)} short{shorts.length > 1 ? ` · +${shorts.length - 1}` : ''}</>
            : 'Balances cover every upcoming bill'}</span>
          <span style={{ marginLeft: 'auto', flexShrink: 0, opacity: 0.6, fontWeight: 700 }}>›</span>
        </a>
      )}

      {/* Dense one-line rows: date · name · amount. The date carries coverage — green while
          the account funds it, red once the balance has run out. Scrolls past 5 rows so a
          busy fortnight doesn't push the rest of Home down the page. */}
      <div style={{ marginTop: 12, maxHeight: ROW_H * 5 + 8, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {rows.map((u, i) => {
          const cov = coverageOf(u)
          const dateColor = cov === 'covered' ? 'var(--income)' : cov === 'short' ? 'var(--expense)' : 'var(--text-secondary)'
          return (
            <div key={`${u.b.id}-${ymd(u.date)}`}>
              {/* where the balance runs out — only worth drawing if something above it is funded */}
              {i === firstShortIdx && i > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0 6px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--expense)', whiteSpace: 'nowrap' }}>Balance runs out</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--expense)', opacity: 0.3 }} />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: i > 0 && i !== firstShortIdx ? '1px solid var(--border)' : 'none' }}>
                <span style={{ width: 52, flexShrink: 0, fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: dateColor }}>
                  {u.date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.b.name}</span>
                <span style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{money(Number(u.b.amount))}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON, cachedValue } from '@/lib/fresh'
import { today, ymd } from '@/lib/date'
import { projectCycle, nextOccurrences } from '@/lib/billRunway'
import { TriangleAlert, ChevronDown } from 'lucide-react'
import LoadError from './LoadError'

interface Bill { id: string; account_id: string | null; name: string; day: number; amount: number; quarterly?: boolean; next_due?: string | null }
interface Account { id: string; name: string; current_balance?: number; balance_as_of?: string | null; buffer?: number }
interface BillsResp { bills: Bill[]; accounts: Account[] }

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const ROW_H = 38   // one bill row (9px padding x 2 + line + border) - 5 of them sets the scroll height
const UNASSIGNED = '__none__' // pseudo-account for bills not attached to one
const fmtDay = (d: Date) => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

// Compact "what's due next" list for Home — pulls from the same bills the Bills tab uses.
export default function UpcomingBills() {
  const [data, setData] = useState<BillsResp | null>(() => cachedValue<BillsResp>('/api/bills'))
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [picked, setPicked] = useState<string>('') // '' = follow the default below

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

  // One cycle - the next occurrence of each bill, once each - exactly the window the
  // Bills tab forecasts, so the two cards describe the same span.
  const from = strip(new Date(today() + 'T00:00:00'))

  // Each account pays its own bills from its own balance, so coverage only means anything
  // within an account. The card shows one at a time rather than interleaving them.
  const cycles = new Map<string, ReturnType<typeof projectCycle<Bill>>>()
  for (const a of accounts) {
    const ab = bills.filter((b) => b.account_id === a.id)
    // an account with no balance on record gets no projection — no false alarms, and its
    // bills stay neutral rather than being coloured green on no evidence
    if (ab.length && (Number(a.current_balance) > 0 || a.balance_as_of)) {
      cycles.set(a.id, projectCycle(ab, { current_balance: a.current_balance, balance_as_of: a.balance_as_of, buffer: a.buffer }))
    }
  }
  const orphans = bills.filter((b) => !b.account_id || !accounts.some((a) => a.id === b.account_id))
  const tabs: { id: string; name: string; shortFrom: string | null }[] = [
    ...accounts.filter((a) => bills.some((b) => b.account_id === a.id))
      .map((a) => ({ id: a.id, name: a.name, shortFrom: cycles.get(a.id)?.firstShort?.iso ?? null })),
    ...(orphans.length ? [{ id: UNASSIGNED, name: 'Other', shortFrom: null }] : []),
  ]

  // Which tab to show: whatever was tapped, else the account that runs short soonest so the
  // card opens on the problem rather than waiting to be found. Derived rather than stored,
  // so the first paint already has the right one and a new shortfall can claim the default.
  const urgent = tabs.filter((t) => t.shortFrom).sort((x, y) => x.shortFrom!.localeCompare(y.shortFrom!))[0]
  const activeId = picked && tabs.some((t) => t.id === picked) ? picked : (urgent?.id ?? tabs[0]?.id ?? '')

  const activeBills = activeId === UNASSIGNED ? orphans : bills.filter((b) => b.account_id === activeId)
  const upcoming = nextOccurrences(activeBills, from)
  const cycle = cycles.get(activeId) ?? null

  // Nothing to show / still cold-loading with no cache → render nothing (keep Home clean)
  if (!data && !loaded) return null
  if (error && !bills.length) return (
    <div className="card glass"><span className="hdr-label">Bills</span><LoadError onRetry={() => { setError(false); load() }} label="Couldn't load bills" compact /></div>
  )
  if (!bills.length) return null

  // list == headline total == this account's whole cycle; scrolls rather than truncating
  const rows = upcoming
  const totalSoon = rows.reduce((s, u) => s + Number(u.b.amount), 0)
  const horizonEnd = rows.length ? rows[rows.length - 1].date : from
  // open the Bills tab already showing the account that was tapped
  const goBills = (accountId?: string) => {
    try {
      localStorage.setItem('jt-dash-tab', 'bills')
      if (accountId && accountId !== UNASSIGNED) localStorage.setItem('jt-bill-account', accountId)
    } catch { /* ignore */ }
  }

  // One account in view, so coverage is a clean cutoff: funded through this date, short after.
  const cutoff = cycle?.coveredThroughISO ?? null
  const coverageOf = (u: { date: Date }): 'covered' | 'short' | 'unknown' =>
    !cycle ? 'unknown' : cutoff && ymd(u.date) <= cutoff ? 'covered' : 'short'
  const firstShortIdx = cycle ? rows.findIndex((u) => coverageOf(u) === 'short') : -1

  const activeTab = tabs.find((t) => t.id === activeId)
  const dotFor = (t: { id: string; shortFrom: string | null }) =>
    !cycles.has(t.id) ? 'var(--text-muted)' : t.shortFrom ? 'var(--expense)' : 'var(--income)'

  const accountPill = tabs.length > 1 && activeTab && (
    <span style={{ position: 'relative', display: 'inline-flex', minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, padding: '3px 7px 3px 8px',
        borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)',
        fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: dotFor(activeTab) }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTab.name}</span>
        <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.65 }} />
      </span>
      {/* the real control sits invisibly on top, so the platform's own picker opens */}
      <select value={activeId} onChange={(e) => setPicked(e.target.value)} aria-label="Bill account"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0,
          appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16 }}>
        {tabs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </span>
  )

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span className="hdr-label" style={{ flexShrink: 0 }}>Bills</span>
        {accountPill}
      </span>
      {rows.length > 0 && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
          <b style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{money(totalSoon)}</b> · {fmtDay(from)} → {fmtDay(horizonEnd)}
        </span>
      )}
    </div>
  )

  return (
    <div className="card glass">
      {/* Header taps to Bills only when there's no coverage card to carry the tap */}
      {cycle || accountPill ? header : <a href="/dashboard" onClick={() => goBills(activeId)} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{header}</a>}

      {/* Coverage — a thin tinted card, clickable through to the Bills tab. Red when an
          account runs short (standard --expense), green when covered. */}
      {cycle && (
        <a href="/dashboard" onClick={() => goBills(activeId)}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 10, padding: '8px 11px', borderRadius: 10, fontSize: 12, fontWeight: 600, lineHeight: 1.45, textDecoration: 'none',
            color: cycle.short > 0 ? 'var(--expense)' : 'var(--income)',
            background: cycle.short > 0 ? 'color-mix(in srgb, var(--expense) 12%, transparent)' : 'color-mix(in srgb, var(--income) 10%, transparent)' }}>
          {cycle.short > 0 && <TriangleAlert size={13} style={{ flexShrink: 0, marginTop: 2 }} />}
          {/* Leads with the account name so the card states what it's describing rather than
              leaving it to the pill alone. Wraps rather than ellipsising — truncating would
              drop the dollar amount at the end. */}
          <span style={{ minWidth: 0 }}>
            <b style={{ fontWeight: 700 }}>{activeTab?.name}</b>{' · '}{cycle.short > 0
              ? cutoff
                ? <>covers bills to {fmtDay(new Date(cutoff + 'T00:00:00'))} · {money(cycle.short)} short</>
                : <>no bills covered · {money(cycle.short)} short{cycle.firstShort ? <> from {fmtDay(new Date(cycle.firstShort.iso + 'T00:00:00'))}</> : null}</>
              : 'covers every upcoming bill'}</span>
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

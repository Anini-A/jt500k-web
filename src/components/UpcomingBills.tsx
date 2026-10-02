'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON, cachedValue } from '@/lib/fresh'
import { today } from '@/lib/date'
import { projectCycle, nextOccurrences } from '@/lib/billRunway'
import LoadError from './LoadError'

interface Bill { id: string; account_id: string | null; name: string; day: number; amount: number; quarterly?: boolean; next_due?: string | null }
interface Account { id: string; name: string; current_balance?: number; balance_as_of?: string | null; buffer?: number }
interface BillsResp { bills: Bill[]; accounts: Account[] }

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
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
  const asOfById = new Map<string, string | null>()
  for (const a of accounts) {
    asOfById.set(a.id, a.balance_as_of ?? null)
    const ab = bills.filter((b) => b.account_id === a.id)
    // an account with no balance on record gets no projection — no false alarms, and its
    // bills stay neutral rather than being coloured green on no evidence
    if (ab.length && (Number(a.current_balance) > 0 || a.balance_as_of)) {
      cycles.set(a.id, projectCycle(ab, { current_balance: a.current_balance, balance_as_of: a.balance_as_of, buffer: a.buffer }))
    }
  }
  // Items with no account (income, savings, spending not paid from a bill account) are
  // scheduled and loggable but have no balance to run short against — they belong to the
  // logging list, not the cash-flow forecast, so no tab.
  const tabs: { id: string; name: string; shortFrom: string | null; short: number }[] = accounts
    .filter((a) => bills.some((b) => b.account_id === a.id))
    .map((a) => ({ id: a.id, name: a.name, shortFrom: cycles.get(a.id)?.firstShort?.iso ?? null, short: cycles.get(a.id)?.short ?? 0 }))

  // Which tab to show: whatever was tapped, else the first account in the configured
  // order (bill_accounts.sort) — UNLESS it's covered and another account isn't, in which
  // case open on the account that needs the most money.
  //
  // Ranking by the SIZE of the shortfall, not by how soon it starts: "soonest" let Transpo
  // ($248 short, first bill on the 1st) outrank Home & Utilities ($2,404 short from the
  // 6th) every month, and the winner changed as due dates passed, so the card never
  // settled. Size only re-ranks when the bigger problem genuinely moves.
  //
  // The default account still wins whenever it is itself short, so the common case is
  // stable; this only redirects when it has nothing to report and another account does.
  const fallbackId = (() => {
    const first = tabs[0]
    if (!first || first.short > 0) return first?.id ?? ''
    const worst = tabs.filter((t) => t.short > 0).sort((x, y) => y.short - x.short)[0]
    return worst?.id ?? first.id
  })()
  const activeId = picked && tabs.some((t) => t.id === picked) ? picked : fallbackId

  const activeAsOf = asOfById.get(activeId) || today()
  const staleDays = Math.max(0, Math.round((Date.parse(today()) - Date.parse(activeAsOf)) / 86400000))
  const activeBills = bills.filter((b) => b.account_id === activeId)
  const upcoming = nextOccurrences(activeBills, from)
  const cycle = cycles.get(activeId) ?? null

  // Nothing to show / still cold-loading with no cache → render nothing (keep Home clean)
  if (!data && !loaded) return null
  if (error && !bills.length) return (
    <div className="card"><span className="hdr-label">Bills</span><LoadError onRetry={() => { setError(false); load() }} label="Couldn't load bills" compact /></div>
  )
  if (!bills.length) return null

  // the account's whole cycle; scrolls rather than truncating
  const rows = upcoming
  // open the Bills tab already showing the account that was tapped
  const goBills = (accountId?: string) => {
    try {
      localStorage.setItem('jt-dash-tab', 'bills')
      if (accountId) localStorage.setItem('jt-bill-account', accountId)
    } catch { /* ignore */ }
  }

  const cutoff = cycle?.coveredThroughISO ?? null

  const dotFor = (t: { id: string; shortFrom: string | null }) =>
    !cycles.has(t.id) ? 'var(--text-muted)' : t.shortFrom ? 'var(--expense)' : 'var(--income)'

  // Both accounts on screen at once, each with its status dot — one tap to switch instead
  // of a native picker that covers the thing you're switching. iOS-style: recessed
  // track, raised thumb on the active one.
  const accountSeg = tabs.length > 1 && (
    <div className="acct-seg" role="tablist" aria-label="Bill account">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === activeId}
          className={t.id === activeId ? 'is-on' : ''} onClick={() => setPicked(t.id)}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: dotFor(t) }} />
          {t.name}
        </button>
      ))}
    </div>
  )

  // BILLS on the left, switcher centred. The empty spacer opposite the label is what
  // keeps the switcher centred on the CARD rather than in the space the label leaves:
  // both sides of the row flex equally, so the middle stays put whatever the label's width.
  const header = accountSeg ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="hdr-label">Bills</span>
      </span>
      {accountSeg}
      <span style={{ flex: 1, minWidth: 0 }} />
    </div>
  ) : (
    // one account: no switcher to centre, so the label just leads the card as before
    <span className="hdr-label">Bills</span>
  )

  return (
    <div className="card">
      {/* Header taps to Bills only when there's no coverage card to carry the tap */}
      {cycle || accountSeg ? header : <a href="/dashboard" onClick={() => goBills(activeId)} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{header}</a>}

      {/* The same two numbers the Bills tab shows, in the same words: what the balance
         reaches, and what to deposit. Home states the position; the Bills tab has the
         per-bill detail, so the list of bills you can't act on here isn't repeated. */}
      {cycle ? (
        <a href="/dashboard" onClick={() => goBills(activeId)}
          style={{ display: 'flex', gap: 10, marginTop: 12, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--income-soft)' }}>
            <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--income)' }}>You have</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-lg)', letterSpacing: '-0.02em', marginTop: 2 }}>{money(cycle.startBalance)}</div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
              {!cycle.firstShort ? `covers every bill to ${fmtDay(new Date(cycle.horizonISO + 'T00:00:00'))}`
                : cutoff ? `covers ${cycle.coveredCount} bill${cycle.coveredCount === 1 ? '' : 's'} to ${fmtDay(new Date(cutoff + 'T00:00:00'))}`
                : 'short from the first bill'}
            </div>
            {/* The Bills page warns when the balance is a day or more old; Home showed the
                same figure — and a Top up derived from it — with nothing to say it might be
                out of date. Dating the number is enough: silent while it's today's. */}
            {staleDays > 0 && (
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--expense)', marginTop: 3 }}>
                as of {fmtDay(new Date(activeAsOf + 'T00:00:00'))} · {staleDays}d ago
              </div>
            )}
          </div>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: cycle.firstShort ? 'var(--expense-soft)' : 'var(--kpi-bg)', border: cycle.firstShort ? 'none' : '1px solid var(--border)' }}>
            <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: cycle.firstShort ? 'var(--expense)' : 'var(--income)' }}>Top up</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-lg)', letterSpacing: '-0.02em', marginTop: 2, color: cycle.firstShort ? 'var(--expense)' : 'var(--income)' }}>{money(cycle.short)}</div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
              {cycle.firstShort ? `for ${cycle.remainingCount} bill${cycle.remainingCount === 1 ? '' : 's'} to ${fmtDay(new Date(cycle.horizonISO + 'T00:00:00'))}` : 'every bill covered'}
            </div>
          </div>
        </a>
      ) : (
        /* no balance on record for this account — nothing to project against, so just
           say what's next rather than implying coverage we can't compute */
        rows.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
            Next: {rows[0].b.name} · {money(Number(rows[0].b.amount))} on {fmtDay(rows[0].date)}
          </div>
        )
      )}

      <a href="/dashboard" onClick={() => goBills(activeId)}
        style={{ display: 'block', textAlign: 'center', marginTop: 11, fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
        See all {rows.length} bill{rows.length === 1 ? '' : 's'} ›
      </a>
    </div>
  )
}

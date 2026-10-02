'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON, cachedValue } from '@/lib/fresh'
import { today } from '@/lib/date'
import { projectCycle, nextOccurrences } from '@/lib/billRunway'
import { ChevronDown } from 'lucide-react'
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
  for (const a of accounts) {
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
  const tabs: { id: string; name: string; shortFrom: string | null }[] = accounts
    .filter((a) => bills.some((b) => b.account_id === a.id))
    .map((a) => ({ id: a.id, name: a.name, shortFrom: cycles.get(a.id)?.firstShort?.iso ?? null }))

  // Which tab to show: whatever was tapped, else the first account in the configured order
  // (bill_accounts.sort, which /api/bills already orders by).
  //
  // This used to open on whichever account ran short SOONEST. That sounds helpful but the
  // card then flips between accounts as due dates pass — a small account with an early bill
  // outranks the main one every time — so Home never settled on the account that matters.
  // A stable default beats a clever one; the other account is one tap away and its pill dot
  // still shows red when it's short.
  const activeId = picked && tabs.some((t) => t.id === picked) ? picked : (tabs[0]?.id ?? '')

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

  const activeTab = tabs.find((t) => t.id === activeId)
  const dotFor = (t: { id: string; shortFrom: string | null }) =>
    !cycles.has(t.id) ? 'var(--text-muted)' : t.shortFrom ? 'var(--expense)' : 'var(--income)'

  const accountPill = tabs.length > 1 && activeTab && (
    <span style={{ position: 'relative', display: 'inline-flex', minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, padding: '3px 7px 3px 8px',
        borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)', background: 'var(--kpi-bg)',
        fontSize: 'var(--fs-2xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: dotFor(activeTab) }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTab.name}</span>
        <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.65 }} />
      </span>
      {/* the real control sits invisibly on top, so the platform's own picker opens */}
      <select value={activeId} onChange={(e) => setPicked(e.target.value)} aria-label="Bill account"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0,
          appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 'var(--fs-lg)' }}>
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
    </div>
  )

  return (
    <div className="card">
      {/* Header taps to Bills only when there's no coverage card to carry the tap */}
      {cycle || accountPill ? header : <a href="/dashboard" onClick={() => goBills(activeId)} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{header}</a>}

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

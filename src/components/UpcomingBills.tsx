'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON, cachedValue } from '@/lib/fresh'
import { today, ymd } from '@/lib/date'
import { shortfall } from '@/lib/billRunway'
import { TriangleAlert, CheckCircle2 } from 'lucide-react'
import LoadError from './LoadError'

interface Bill { id: string; account_id: string | null; name: string; day: number; amount: number; quarterly?: boolean; next_due?: string | null }
interface Account { id: string; name: string; current_balance?: number; balance_as_of?: string | null; buffer?: number }
interface BillsResp { bills: Bill[]; accounts: Account[] }

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const HORIZON = 14 // "next 2 weeks"

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
  const rows = upcoming.slice(0, 5)
  const goBills = () => { try { localStorage.setItem('jt-dash-tab', 'bills') } catch { /* ignore */ } }

  // Coverage: for each account that HAS a tracked balance, will it cover its bills
  // without dipping below its buffer? (Skip accounts with no balance set — no false alarms.)
  const tracked = accounts.filter((a) => Number(a.current_balance) > 0 || a.balance_as_of)
  const shorts = tracked
    .map((a) => {
      const ab = bills.filter((b) => b.account_id === a.id)
      if (!ab.length) return null
      const res = shortfall(ab, { current_balance: a.current_balance, balance_as_of: a.balance_as_of, buffer: a.buffer })
      return res && res.short > 0 ? { name: a.name, short: res.short, label: res.trough.label } : null
    })
    .filter((x): x is { name: string; short: number; label: string } => x !== null)
    .sort((a, b) => b.short - a.short)
  const hasCoverage = tracked.some((a) => bills.some((b) => b.account_id === a.id))
  const worst = shorts[0]

  return (
    <div className="card glass">
      <span className="hdr-label">Upcoming bills</span>

      {/* Hero: how much is leaving over the next two weeks, with coverage right beneath */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
        {within.length > 0 ? (<>
          <span style={{ fontSize: 'clamp(26px, 7vw, 32px)', fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{money(totalSoon)}</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>due in 2 weeks</span>
        </>) : (
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>Nothing due for 2 weeks</span>
        )}
      </div>
      {hasCoverage && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 12.5, fontWeight: 600, color: worst ? 'var(--expense)' : 'var(--income)' }}>
          {worst ? <TriangleAlert size={14} style={{ flexShrink: 0 }} /> : <CheckCircle2 size={14} style={{ flexShrink: 0 }} />}
          <span>{worst
            ? <>{worst.name} runs short ~{money(worst.short)} by {worst.label}{shorts.length > 1 ? ` · +${shorts.length - 1} more` : ''}</>
            : 'On track — balances cover every bill'}</span>
        </div>
      )}

      {/* Agenda: date chip + name/timing + amount, with a light "Later" divider past a week out */}
      <div style={{ display: 'grid', gap: 2, marginTop: 16 }}>
        {rows.map((u, i) => {
          const urgent = u.days <= 3
          const timing = u.days === 0 ? 'Today' : u.days === 1 ? 'Tomorrow' : `in ${u.days} days`
          const acc = acctName(u.b.account_id)
          const showLater = i > 0 && u.days > 7 && rows[i - 1].days <= 7
          return (
            <div key={u.b.id}>
              {showLater && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '10px 0 6px' }}>Later</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
                <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, display: 'grid', placeItems: 'center', lineHeight: 1,
                  background: urgent ? 'color-mix(in srgb, var(--expense) 12%, var(--kpi-bg))' : 'var(--kpi-bg)',
                  border: `1px solid ${urgent ? 'color-mix(in srgb, var(--expense) 28%, transparent)' : 'var(--border)'}` }}>
                  <div style={{ fontSize: 17.5, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: urgent ? 'var(--expense)' : 'var(--text-primary)' }}>{u.date.getDate()}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: urgent ? 'var(--expense)' : 'var(--text-muted)', marginTop: 2 }}>{u.date.toLocaleDateString('en-CA', { month: 'short' })}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.b.name}</div>
                  <div style={{ fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: urgent ? 'var(--expense)' : 'var(--text-muted)', fontWeight: urgent ? 700 : 400 }}>{timing}</span>
                    {acc && <span style={{ color: 'var(--text-muted)' }}> · {acc}</span>}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{money(Number(u.b.amount))}</div>
              </div>
            </div>
          )
        })}
      </div>

      <a href="/dashboard" onClick={goBills} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
        {upcoming.length > rows.length ? `View all ${upcoming.length} bills` : 'Manage bills'} →
      </a>
    </div>
  )
}

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
  const rows = upcoming.slice(0, 4)
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
      {/* Header: label + the two-week total sitting quietly on the right */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span className="hdr-label">Upcoming bills</span>
        {within.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            <b style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{money(totalSoon)}</b> in 2 wks
          </span>
        )}
      </div>

      {/* Coverage banner: green when covered, red when an account will run short */}
      {hasCoverage && (
        worst ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '9px 11px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, color: 'var(--expense)', background: 'color-mix(in srgb, var(--expense) 11%, transparent)', border: '1px solid color-mix(in srgb, var(--expense) 22%, transparent)' }}>
            <TriangleAlert size={15} style={{ flexShrink: 0 }} />
            <span>{worst.name} may run short — top up ~{money(worst.short)} by {worst.label}{shorts.length > 1 ? ` (+${shorts.length - 1} more)` : ''}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '9px 11px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, color: 'var(--income)', background: 'color-mix(in srgb, var(--income) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--income) 20%, transparent)' }}>
            <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
            <span>Balances cover every upcoming bill</span>
          </div>
        )
      )}

      {/* Bill rows: a soft date chip (red-tinted when imminent), name/account, amount + due pill */}
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {rows.map((u) => {
          const urgent = u.days <= 3
          const when = u.days === 0 ? 'Today' : u.days === 1 ? 'Tomorrow' : `${u.days} days`
          const acc = acctName(u.b.account_id)
          return (
            <div key={u.b.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 13, display: 'grid', placeItems: 'center', lineHeight: 1,
                background: urgent ? 'color-mix(in srgb, var(--expense) 12%, var(--kpi-bg))' : 'var(--kpi-bg)',
                border: `1px solid ${urgent ? 'color-mix(in srgb, var(--expense) 30%, transparent)' : 'var(--border)'}` }}>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: urgent ? 'var(--expense)' : 'var(--text-primary)' }}>{u.date.getDate()}</div>
                <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: urgent ? 'var(--expense)' : 'var(--text-muted)', marginTop: 2 }}>{u.date.toLocaleDateString('en-CA', { month: 'short' })}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.b.name}</div>
                {acc && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc}</div>}
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{money(Number(u.b.amount))}</div>
                <div style={{ display: 'inline-block', marginTop: 3, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap',
                  color: urgent ? 'var(--expense)' : 'var(--text-muted)',
                  background: urgent ? 'color-mix(in srgb, var(--expense) 13%, transparent)' : 'var(--kpi-bg)' }}>{when}</div>
              </div>
            </div>
          )
        })}
      </div>

      <a href="/dashboard" onClick={goBills} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
        {upcoming.length > rows.length ? `View all ${upcoming.length} bills` : 'Manage bills'} →
      </a>
    </div>
  )
}

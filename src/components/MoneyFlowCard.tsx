'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { MonthlyArea, COLORS } from './DashCharts'
import { getJSON, cachedValue } from '@/lib/fresh'
import LoadError from './LoadError'

interface Row { month: string; income: number; expense: number; savings: number; net: number }
type Range = 'ytd' | '6m' | 'all'
const RANGES: { key: Range; label: string }[] = [
  { key: 'ytd', label: 'YTD' },
  { key: '6m', label: '6M' },
  { key: 'all', label: 'ALL' },
]
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })

export default function MoneyFlowCard() {
  const [monthly, setMonthly] = useState<Row[]>(() => cachedValue<{ monthly: Row[] }>('/api/charts')?.monthly ?? []) // paint from cache
  const [range, setRange] = useState<Range>('ytd')
  const [open, setOpen] = useState(false) // filters + chart hidden by default
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    getJSON('/api/charts')
      .then((d) => { if (Array.isArray(d.monthly)) { setMonthly(d.monthly); setError(false) } else setError(!cachedValue('/api/charts')); setLoaded(true) })
      .catch(() => { setError(!cachedValue('/api/charts')); setLoaded(true) })
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const data = useMemo(() => {
    if (!monthly.length) return []
    if (range === 'all') return monthly
    if (range === '6m') return monthly.slice(-6)
    // YTD — months of the latest year present
    const year = monthly[monthly.length - 1].month.slice(0, 4)
    return monthly.filter((m) => m.month.slice(0, 4) === year)
  }, [monthly, range])

  // latest month, for the at-a-glance row
  const cur = monthly.length ? monthly[monthly.length - 1] : null
  const curLabel = cur ? new Date(cur.month + '-01T00:00:00').toLocaleDateString('en-CA', { month: 'long' }) : ''
  const prevM = monthly.length >= 2 ? monthly[monthly.length - 2] : null // last complete month, for deltas
  const glance = cur ? [
    { label: 'Income', value: cur.income, delta: prevM ? cur.income - prevM.income : null, goodUp: true, color: COLORS.income },
    { label: 'Savings', value: cur.savings, delta: prevM ? cur.savings - prevM.savings : null, goodUp: true, color: COLORS.savings },
    { label: 'Expenses', value: cur.expense, delta: prevM ? cur.expense - prevM.expense : null, goodUp: false, color: COLORS.expense },
  ] : []
  const savedRate = cur && cur.income > 0 ? Math.round((cur.savings / cur.income) * 100) : null

  return (
    <div className="card glass">
      <span className="hdr-label">Money flow</span>

      {/* this-month glance — always visible */}
      {cur ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {glance.map((g) => (
            <div key={g.label} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                <span className="stat-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 'clamp(15px, 4.6vw, 19px)', letterSpacing: '-0.02em', marginTop: 3 }}>{money(g.value)}</div>
              {/* arrow = direction vs last month; color = better/worse (green good, red bad) */}
              {g.delta !== null && Math.abs(g.delta) >= 1 && (
                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: (g.goodUp ? g.delta >= 0 : g.delta < 0) ? 'var(--income)' : 'var(--expense)' }}>
                  {g.delta >= 0 ? '▲' : '▼'} {money(Math.abs(g.delta))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : error ? (
        <LoadError onRetry={() => { setError(false); load() }} label="Couldn't load money flow" compact />
      ) : !loaded ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <span className="skeleton" style={{ width: 56, height: 11, display: 'inline-block' }} />
              <span className="skeleton" style={{ display: 'block', width: 70, height: 19, margin: '5px auto 0' }} />
            </div>
          ))}
        </div>
      ) : null}

      {/* one thin line + the collapse toggle (same design as the net-worth card) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cur ? <>{curLabel}{savedRate !== null ? <> · <b style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{savedRate}%</b> saved</> : ''}</> : ''}
        </span>
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Hide trend' : 'Show trend'} title={open ? 'Hide trend' : 'Show income / expense trend'}
          style={{ flexShrink: 0, width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
        </button>
      </div>

      {/* collapsible — range filters + trend chart */}
      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          {/* same slim filter as the net-worth card — plain labels, active in a pill */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 12 }}>
            {RANGES.map((r) => {
              const on = range === r.key
              return (
                <button key={r.key} onClick={() => setRange(r.key)}
                  style={{ padding: on ? '6px 15px' : '6px 8px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: on ? 700 : 600, fontFamily: 'inherit', background: on ? 'var(--surface-1)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: on ? '0 1px 4px rgba(20,20,25,0.08)' : 'none', transition: 'background .15s, color .15s, box-shadow .15s' }}>{r.label}</button>
              )
            })}
          </div>
          {data.length ? (
            <>
              {/* accessible equivalent for screen readers (div wrapper so width:1px actually clips) */}
              <div className="sr-only">
                <table>
                  <caption>Monthly income, expenses, and savings over {data.length} months.</caption>
                  <thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Savings</th></tr></thead>
                  <tbody>{data.map((m) => (
                    <tr key={m.month}><td>{m.month}</td><td>{money(m.income)}</td><td>{money(m.expense)}</td><td>{money(m.savings)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <MonthlyArea data={data} series={[
                { key: 'income', name: 'Income', color: COLORS.income },
                { key: 'expense', name: 'Expenses', color: COLORS.expense },
                { key: 'savings', name: 'Savings', color: COLORS.savings },
              ]} />
            </>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          )}
        </div>
      )}
    </div>
  )
}

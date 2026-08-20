'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { MonthlyArea, COLORS } from './DashCharts'
import { getJSON } from '@/lib/fresh'

interface Row { month: string; income: number; expense: number; savings: number; net: number }
type Range = 'ytd' | '6m' | 'all'
const RANGES: { key: Range; label: string }[] = [
  { key: 'ytd', label: 'YTD' },
  { key: '6m', label: '6M' },
  { key: 'all', label: 'All' },
]
const money = (n: number) => '$' + Math.round(n).toLocaleString()

export default function MoneyFlowCard() {
  const [monthly, setMonthly] = useState<Row[]>([])
  const [range, setRange] = useState<Range>('ytd')
  const [open, setOpen] = useState(false) // filters + chart hidden by default

  const load = useCallback(() => {
    getJSON('/api/charts').then((d) => { if (Array.isArray(d.monthly)) setMonthly(d.monthly) }).catch(() => {})
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
  const glance = cur ? [
    { label: 'Income', value: cur.income, color: COLORS.income },
    { label: 'Savings', value: cur.savings, color: COLORS.savings },
    { label: 'Expenses', value: cur.expense, color: COLORS.expense },
  ] : []

  return (
    <div className="card glass">
      {/* header — label + collapse toggle (filters + chart live inside) */}
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
        <span className="hdr-label">Money flow</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
          {cur && <span style={{ fontSize: 13 }}>{curLabel}</span>}
          <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
        </span>
      </button>

      {/* this-month glance — always visible */}
      {cur && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {glance.map((g) => (
            <div key={g.label} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                <span className="stat-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 'clamp(15px, 4.6vw, 19px)', letterSpacing: '-0.02em', marginTop: 3 }}>{money(g.value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* collapsible — range filters + trend chart */}
      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 10 }}>
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)}
                className={`chip ${range === r.key ? 'chip-active' : ''}`}>{r.label}</button>
            ))}
          </div>
          {data.length ? (
            <MonthlyArea data={data} series={[
              { key: 'income', name: 'Income', color: COLORS.income },
              { key: 'expense', name: 'Expenses', color: COLORS.expense },
              { key: 'savings', name: 'Savings', color: COLORS.savings },
            ]} />
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          )}
        </div>
      )}
    </div>
  )
}

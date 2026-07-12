'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { MonthlyArea, COLORS } from './DashCharts'
import { getJSON } from '@/lib/fresh'

interface Row { month: string; income: number; expense: number; savings: number; net: number }
type Range = 'ytd' | '12m' | 'all'
const RANGES: { key: Range; label: string }[] = [
  { key: 'ytd', label: 'YTD' },
  { key: '12m', label: '12M' },
  { key: 'all', label: 'All' },
]

export default function MoneyFlowCard() {
  const [monthly, setMonthly] = useState<Row[]>([])
  const [range, setRange] = useState<Range>('ytd')

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
    if (range === '12m') return monthly.slice(-12)
    // YTD — months of the latest year present
    const year = monthly[monthly.length - 1].month.slice(0, 4)
    return monthly.filter((m) => m.month.slice(0, 4) === year)
  }, [monthly, range])

  return (
    <div className="card glass">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 2 }}>Money Flow</h2>
          <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: 0 }}>Income vs Expenses vs Savings</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`chip ${range === r.key ? 'chip-active' : ''}`}>{r.label}</button>
          ))}
        </div>
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
  )
}

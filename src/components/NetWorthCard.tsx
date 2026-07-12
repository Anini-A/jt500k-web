'use client'

import { useEffect, useState, useCallback } from 'react'
import { MonthlyArea, COLORS } from './DashCharts'
import { getJSON } from '@/lib/fresh'

interface NW {
  netWorth: number; holdingsValue: number; cashValue: number; debts: number
  history: { month: string; net: number; investments: number; debts: number }[]
}
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

export default function NetWorthCard() {
  const [d, setD] = useState<NW | null>(null)
  const load = useCallback(() => { getJSON('/api/networth').then((x) => !x.error && setD(x)).catch(() => {}) }, [])
  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  if (!d) return null
  const prev = d.history.length > 1 ? d.history[d.history.length - 2] : null
  const delta = prev ? d.netWorth - prev.net : 0

  return (
    <>
      <section className="block">
        <div className="card glass hero">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div className="stat-label">🪙 Net Worth</div>
            {prev && (
              <span style={{ fontWeight: 600, fontSize: 13, color: delta >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                {delta >= 0 ? '▲' : '▼'} {money(Math.abs(delta))} vs last month
              </span>
            )}
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, margin: '6px 0 14px', color: 'var(--savings)' }}>{money(d.netWorth)}</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Piece label="Investments" value={money(d.holdingsValue)} color="var(--savings)" />
            <Piece label="Cash & other" value={money(d.cashValue)} color="var(--income)" />
            <Piece label="− Debts" value={money(d.debts)} color="var(--expense)" />
          </div>
        </div>
      </section>

      {d.history.length > 0 && (
        <section className="block">
          <div className="card glass">
            <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>Net Worth Over Time</h3>
            <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 14 }}>
              {d.history.length === 1 ? 'Your first snapshot — the climb starts here.' : 'Monthly snapshots toward $500K'}
            </p>
            <MonthlyArea data={d.history} series={[{ key: 'net', name: 'Net Worth', color: COLORS.savings }]} />
          </div>
        </section>
      )}
    </>
  )
}

function Piece({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div style={{ fontWeight: 700, fontSize: 18, color }}>{value}</div>
    </div>
  )
}

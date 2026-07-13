'use client'

import { useEffect, useState, useCallback } from 'react'
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
    <section className="block">
      <div className="card glass">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>🪙 Net Worth</h2>
          {prev && (
            <span style={{ fontWeight: 600, fontSize: 13, color: delta >= 0 ? 'var(--income)' : 'var(--expense)' }}>
              {delta >= 0 ? '▲' : '▼'} {money(Math.abs(delta))} vs last month
            </span>
          )}
        </div>
        {/* Net worth + its parts, all on one line (wraps to 2×2 on a phone) */}
        <div className="stat-grid" style={{ marginTop: 6 }}>
          <Piece label="Net Worth" value={money(d.netWorth)} color="var(--savings)" big />
          <Piece label="Investments" value={money(d.holdingsValue)} color="var(--income)" />
          <Piece label="Cash & other" value={money(d.cashValue)} color="var(--text-primary)" />
          <Piece label="− Debts" value={money(d.debts)} color="var(--expense)" />
        </div>
      </div>
    </section>
  )
}

function Piece({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div style={{ fontWeight: 700, fontSize: big ? 28 : 20, color, marginTop: 4 }}>{value}</div>
    </div>
  )
}

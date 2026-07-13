'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON } from '@/lib/fresh'

interface NW {
  netWorth: number; holdingsValue: number; cashValue: number; debts: number
  history: { month: string; net: number; investments: number; debts: number }[]
}
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const short = (n: number) => n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + n

export default function NetWorthCard() {
  const [d, setD] = useState<NW | null>(null)
  const [goal, setGoal] = useState(500000)
  const load = useCallback(() => { getJSON('/api/networth').then((x) => !x.error && setD(x)).catch(() => {}) }, [])
  useEffect(() => {
    load()
    getJSON('/api/settings').then((s) => { if (!s.error && s.goalAmount) setGoal(Number(s.goalAmount)) }).catch(() => {})
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  if (!d) return null
  const prev = d.history.length > 1 ? d.history[d.history.length - 2] : null
  const delta = prev ? d.netWorth - prev.net : 0
  const pct = Math.min(100, (d.netWorth / goal) * 100)
  const remaining = Math.max(0, goal - d.netWorth)
  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="card glass" style={{ height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>🪙 Net Worth</h2>
        {prev && (
          <span style={{ fontWeight: 600, fontSize: 13, color: delta >= 0 ? 'var(--income)' : 'var(--expense)' }}>
            {delta >= 0 ? '▲' : '▼'} {money(Math.abs(delta))} vs last month
          </span>
        )}
      </div>

      {/* Hero net-worth figure */}
      <div style={{ fontWeight: 800, fontSize: 'clamp(30px, 8vw, 40px)', color: 'var(--savings)', margin: '10px 0 14px', letterSpacing: '-0.02em' }}>
        {money(d.netWorth)}
      </div>

      {/* 500K goal — net worth is the goal metric, so it lives here */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{ margin: 0 }}>🎯 Journey to {short(goal)}</h2>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--savings)' }}>{pct.toFixed(1)}%</span>
      </div>
      <div title={`Where we stand as of ${today}`}
        style={{ height: 14, borderRadius: 999, background: 'var(--kpi-bg)', border: '1px solid var(--border)', overflow: 'hidden', margin: '10px 0 7px', cursor: 'help' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #1baf7a)', borderRadius: 999, transition: 'width .6s ease' }} />
      </div>
      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{money(remaining)} to go</div>

      {/* The parts, as light supporting lines */}
      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        <Piece label="Investments" value={money(d.holdingsValue)} />
        <Piece label="Cash & other" value={money(d.cashValue)} />
        <Piece label="− Debts" value={money(d.debts)} />
      </div>
    </div>
  )
}

function Piece({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 15 }}>{value}</span>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { getJSON } from '@/lib/fresh'

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const short = (n: number) => n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + n

export default function GoalTracker({ saved }: { saved: number }) {
  const [goal, setGoal] = useState(500000)

  useEffect(() => {
    getJSON('/api/settings').then((d) => {
      if (!d.error && d.goalAmount) setGoal(Number(d.goalAmount))
    }).catch(() => {})
  }, [])

  const pct = Math.min(100, (saved / goal) * 100)
  const remaining = Math.max(0, goal - saved)

  return (
    <div className="card glass hero" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>🎯 Journey to {short(goal)}</h2>
        <span style={{ fontWeight: 700, color: 'var(--savings)' }}>{pct.toFixed(1)}%</span>
      </div>

      <div style={{ height: 16, borderRadius: 999, background: 'var(--kpi-bg)', border: '1px solid var(--border)', overflow: 'hidden', margin: '14px 0 12px' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: 'linear-gradient(90deg, #6366f1, #1baf7a)',
          borderRadius: 999, transition: 'width .6s ease',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="stat-label">Saved so far</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--savings)' }}>{money(saved)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat-label">Remaining</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{money(remaining)}</div>
        </div>
      </div>
    </div>
  )
}

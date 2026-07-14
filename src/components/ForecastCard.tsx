'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON } from '@/lib/fresh'

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const short = (n: number) => (n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + n)

// Projects when net worth will cross the goal, based on the recent savings pace.
export default function ForecastCard() {
  const [nw, setNw] = useState<number | null>(null)
  const [goal, setGoal] = useState(500000)
  const [avgSave, setAvgSave] = useState<number | null>(null)

  const load = useCallback(() => {
    getJSON('/api/networth').then((d) => !d.error && setNw(Number(d.netWorth) || 0)).catch(() => {})
    getJSON('/api/settings').then((d) => !d.error && d.goalAmount && setGoal(Number(d.goalAmount))).catch(() => {})
    getJSON('/api/charts').then((d) => {
      if (Array.isArray(d.monthly) && d.monthly.length) {
        const last = d.monthly.slice(-6) // recent pace
        setAvgSave(last.reduce((s: number, m: any) => s + (Number(m.savings) || 0), 0) / last.length)
      } else setAvgSave(0)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  if (nw === null || avgSave === null) return null

  const remaining = Math.max(0, goal - nw)
  const reached = nw >= goal
  const canProject = avgSave > 50

  let dateStr = '', awayStr = ''
  if (!reached && canProject) {
    const totalMonths = Math.ceil(remaining / avgSave)
    const yrs = Math.floor(totalMonths / 12), mos = totalMonths % 12
    awayStr = yrs ? `${yrs} yr${yrs !== 1 ? 's' : ''}${mos ? ` ${mos} mo` : ''}` : `${mos} mo`
    const d = new Date(); d.setMonth(d.getMonth() + totalMonths)
    dateStr = d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
  }

  return (
    <div className="card glass">
      <h2 style={{ margin: 0 }}>🧭 ETA to {short(goal)}</h2>

      {reached ? (
        <div style={{ fontWeight: 800, fontSize: 'clamp(26px, 7vw, 34px)', color: 'var(--income)', margin: '10px 0 2px' }}>
          🎉 Goal reached!
        </div>
      ) : canProject ? (
        <>
          <div style={{ fontWeight: 800, fontSize: 'clamp(28px, 8vw, 40px)', letterSpacing: '-0.02em', margin: '10px 0 2px', color: 'var(--savings)' }}>{dateStr}</div>
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
            about <strong>{awayStr}</strong> away · {money(remaining)} to go
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 16 }}>
            <div style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px' }}>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Recent pace</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{money(avgSave)}/mo saved</div>
            </div>
            <div style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px' }}>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Net worth now</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{money(nw)}</div>
            </div>
          </div>
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 12 }}>
            💡 Based on your savings pace only — investment growth isn&apos;t counted, so you&apos;ll likely get there sooner.
          </div>
        </>
      ) : (
        <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 10 }}>
          Save a bit each month and your projected finish date will appear here.
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON } from '@/lib/fresh'

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const short = (n: number) => (n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + n)

const RATES: { key: string; label: string; rate: number }[] = [
  { key: 'c', label: 'Conservative 5%', rate: 0.05 },
  { key: 'm', label: 'Moderate 7%', rate: 0.07 },
  { key: 'o', label: 'Optimistic 9%', rate: 0.09 },
]

// Projects when net worth crosses the goal — savings compound (they go into TFSA/
// investments), so we grow the whole balance at an assumed annual return.
export default function ForecastCard() {
  const [nw, setNw] = useState<number | null>(null)
  const [goal, setGoal] = useState(500000)
  const [avgSave, setAvgSave] = useState<number | null>(null)
  const [rateKey, setRateKey] = useState('m')
  const [override, setOverride] = useState('') // custom monthly savings (calculator)

  const load = useCallback(() => {
    getJSON('/api/networth').then((d) => !d.error && setNw(Number(d.netWorth) || 0)).catch(() => {})
    getJSON('/api/settings').then((d) => !d.error && d.goalAmount && setGoal(Number(d.goalAmount))).catch(() => {})
    getJSON('/api/charts').then((d) => {
      if (Array.isArray(d.monthly) && d.monthly.length) {
        const last = d.monthly.slice(-6)
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
  const rate = RATES.find((r) => r.key === rateKey)!.rate

  // monthly amount to model: the user's override, else their recent savings pace
  const edited = override.trim() !== '' && !isNaN(Number(override))
  const monthly = edited ? Math.max(0, Number(override)) : avgSave

  // compound month by month: balance grows at the monthly rate, plus the contribution
  const mRate = Math.pow(1 + rate, 1 / 12) - 1
  const MAX = 720 // 60 years cap
  let months = 0, bal = nw
  if (!reached) { while (bal < goal && months < MAX) { bal = bal * (1 + mRate) + monthly; months++ } }
  const projectable = !reached && months < MAX

  let dateStr = '', awayStr = ''
  if (projectable) {
    const yrs = Math.floor(months / 12), mos = months % 12
    awayStr = yrs ? `${yrs} yr${yrs !== 1 ? 's' : ''}${mos ? ` ${mos} mo` : ''}` : `${mos} mo`
    const d = new Date(); d.setMonth(d.getMonth() + months)
    dateStr = d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
  }

  return (
    <div className="card glass">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>🧭 ETA to {short(goal)}</h2>
        {!reached && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {RATES.map((r) => (
              <button key={r.key} onClick={() => setRateKey(r.key)} className={`chip ${rateKey === r.key ? 'chip-active' : ''}`} style={{ padding: '5px 10px', fontSize: 12 }}>{r.label.split(' ')[1]}</button>
            ))}
          </div>
        )}
      </div>

      {reached ? (
        <div style={{ fontWeight: 800, fontSize: 'clamp(26px, 7vw, 34px)', color: 'var(--income)', margin: '10px 0 2px' }}>🎉 Goal reached!</div>
      ) : projectable ? (
        <>
          <div style={{ fontWeight: 800, fontSize: 'clamp(28px, 8vw, 40px)', letterSpacing: '-0.02em', margin: '10px 0 2px', color: 'var(--savings)' }}>{dateStr}</div>
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
            about <strong>{awayStr}</strong> away · {money(remaining)} to go
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 16 }}>
            <div style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 11 }}>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Adding / month ✎</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, marginTop: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>$</span>
                <input inputMode="numeric" value={edited ? override : String(Math.round(avgSave))}
                  onChange={(e) => setOverride(e.target.value.replace(/[^0-9.]/g, ''))}
                  style={{ width: 74, fontWeight: 700, fontSize: 16, padding: '2px 2px', border: 'none', borderBottom: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }} />
                <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>/mo</span>
              </div>
              {edited && Math.round(Number(override)) !== Math.round(avgSave) && (
                <button onClick={() => setOverride('')} style={{ marginTop: 4, background: 'transparent', border: 'none', padding: 0, color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>↺ use my pace ({money(avgSave)})</button>
              )}
            </div>
            <div style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 11 }}>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Net worth now</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{money(nw)}</div>
            </div>
          </div>
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 12 }}>
            💡 Starts from your recent savings pace ({money(avgSave)}/mo) — edit &quot;Adding&quot; to try any amount. Assumes contributions (TFSA/RRSP/RESP…) compound at ~{Math.round(rate * 100)}%/yr.
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

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { getJSON } from '@/lib/fresh'

interface NW {
  netWorth: number; holdingsValue: number; cashValue: number; debts: number
  history: { month: string; net: number; investments: number; debts: number }[]
}
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const short = (n: number) => (n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + n)

// Net worth (where you are) + projection to the goal (where you're headed), in one hero.
export default function JourneyCard() {
  const [d, setD] = useState<NW | null>(null)
  const [goal, setGoal] = useState(500000)
  const [avgSave, setAvgSave] = useState<number | null>(null)
  const [rateKey, setRateKey] = useState<'c' | 'm' | 'o'>('m')
  const [customRate, setCustomRate] = useState('9') // the editable "optimistic" rate
  const [override, setOverride] = useState('')        // custom monthly contribution
  const seeded = useRef(false)

  const load = useCallback(() => {
    getJSON('/api/networth').then((x) => !x.error && setD(x)).catch(() => {})
    getJSON('/api/settings').then((s) => { if (!s.error && s.goalAmount) setGoal(Number(s.goalAmount)) }).catch(() => {})
    getJSON('/api/charts').then((x) => {
      if (Array.isArray(x.monthly) && x.monthly.length) {
        const last = x.monthly.slice(-6)
        setAvgSave(last.reduce((s: number, m: any) => s + (Number(m.savings) || 0), 0) / last.length)
      } else setAvgSave(0)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  useEffect(() => {
    if (!seeded.current && avgSave !== null) { seeded.current = true; setOverride(String(Math.round(avgSave))) }
  }, [avgSave])

  if (!d || avgSave === null) return null

  const nw = d.netWorth
  const prev = d.history.length > 1 ? d.history[d.history.length - 2] : null
  const delta = prev ? nw - prev.net : 0
  const pct = Math.min(100, (nw / goal) * 100)
  const remaining = Math.max(0, goal - nw)
  const reached = nw >= goal
  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })

  const cr = parseFloat(customRate)
  const rate = rateKey === 'c' ? 0.05 : rateKey === 'm' ? 0.07 : (isNaN(cr) ? 0.09 : Math.max(0, cr) / 100)
  const monthly = override.trim() === '' || isNaN(Number(override)) ? 0 : Math.max(0, Number(override))

  // compound month by month
  const mRate = Math.pow(1 + rate, 1 / 12) - 1
  const MAX = 720
  let months = 0, bal = nw
  if (!reached) { while (bal < goal && months < MAX) { bal = bal * (1 + mRate) + monthly; months++ } }
  const projectable = !reached && months < MAX
  let dateStr = '', awayStr = ''
  if (projectable) {
    const yrs = Math.floor(months / 12), mos = months % 12
    awayStr = yrs ? `${yrs} yr${yrs !== 1 ? 's' : ''}${mos ? ` ${mos} mo` : ''}` : `${mos} mo`
    const dt = new Date(); dt.setMonth(dt.getMonth() + months)
    dateStr = dt.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
  }

  return (
    <div className="card glass">
      <div className="grid-2" style={{ gap: 20 }}>
        {/* LEFT — where you are */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>🪙 Net Worth</h2>
            {prev && (
              <span style={{ fontWeight: 600, fontSize: 13, color: delta >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                {delta >= 0 ? '▲' : '▼'} {money(Math.abs(delta))} vs last month
              </span>
            )}
          </div>
          <div style={{ fontWeight: 800, fontSize: 'clamp(30px, 8vw, 40px)', color: 'var(--savings)', margin: '10px 0 14px', letterSpacing: '-0.02em' }}>{money(nw)}</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <h2 style={{ margin: 0 }}>🎯 Journey to {short(goal)}</h2>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--savings)' }}>{pct.toFixed(1)}%</span>
          </div>
          <div title={`Where we stand as of ${today}`}
            style={{ height: 14, borderRadius: 999, background: 'var(--kpi-bg)', border: '1px solid var(--border)', overflow: 'hidden', margin: '10px 0 7px', cursor: 'help' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #1baf7a)', borderRadius: 999, transition: 'width .6s ease' }} />
          </div>
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{money(remaining)} to go</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16, flex: 1 }}>
            <Piece label="Investments" value={money(d.holdingsValue)} />
            <Piece label="Cash & other" value={money(d.cashValue)} />
            <Piece label="− Debts" value={money(d.debts)} />
          </div>
        </div>

        {/* RIGHT — where you're headed */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>🧭 ETA to {short(goal)}</h2>
            {!reached && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setRateKey('c')} className={`chip ${rateKey === 'c' ? 'chip-active' : ''}`} style={{ padding: '5px 10px', fontSize: 12 }}>5%</button>
                <button onClick={() => setRateKey('m')} className={`chip ${rateKey === 'm' ? 'chip-active' : ''}`} style={{ padding: '5px 10px', fontSize: 12 }}>7%</button>
                <span className={`chip ${rateKey === 'o' ? 'chip-active' : ''}`} style={{ padding: '5px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 1 }}
                  title="Editable — try any rate">
                  <input inputMode="decimal" value={customRate} aria-label="Custom return rate"
                    onFocus={() => setRateKey('o')}
                    onChange={(e) => { setCustomRate(e.target.value.replace(/[^0-9.]/g, '')); setRateKey('o') }}
                    style={{ width: 26, fontSize: 12, fontWeight: 600, textAlign: 'right', border: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit', outline: 'none', padding: 0 }} />
                  %
                </span>
              </div>
            )}
          </div>

          {reached ? (
            <div style={{ fontWeight: 800, fontSize: 'clamp(26px, 7vw, 34px)', color: 'var(--income)', margin: '10px 0 2px' }}>🎉 Goal reached!</div>
          ) : projectable ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 'clamp(28px, 8vw, 40px)', letterSpacing: '-0.02em', margin: '10px 0 2px', color: 'var(--savings)' }}>{dateStr}</div>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                about <strong>{awayStr}</strong> away · at ~{Math.round(rate * 100 * 10) / 10}%/yr
              </div>
              <div style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 11, marginTop: 16 }}>
                <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Adding / month ✎</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, marginTop: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 18 }}>$</span>
                  <input inputMode="numeric" value={override} placeholder="0"
                    onChange={(e) => setOverride(e.target.value.replace(/[^0-9.]/g, ''))}
                    style={{ width: 92, fontWeight: 700, fontSize: 18, padding: '2px 2px', border: 'none', borderBottom: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }} />
                  <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>/mo</span>
                </div>
                {Math.round(Number(override) || 0) !== Math.round(avgSave) && (
                  <button onClick={() => setOverride(String(Math.round(avgSave)))} style={{ marginTop: 4, background: 'transparent', border: 'none', padding: 0, color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>↺ use my pace ({money(avgSave)})</button>
                )}
              </div>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 12 }}>
                💡 Seeded from your recent pace ({money(avgSave)}/mo). Tap a rate or type your own — contributions compound at that return.
              </div>
            </>
          ) : (
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 10 }}>
              Add a monthly amount (or a return rate) and your projected finish date appears here.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Piece({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 11px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

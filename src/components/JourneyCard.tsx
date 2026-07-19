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
    <div className="card glass" style={{ padding: 'clamp(20px, 4vw, 30px)' }}>
      <div className="grid-2" style={{ gap: 'clamp(24px, 5vw, 48px)' }}>
        {/* LEFT — where you are */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <Label>Net worth</Label>
            {prev && (
              <span style={{ fontWeight: 500, fontSize: 12, color: delta >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                {delta >= 0 ? '↑' : '↓'} {money(Math.abs(delta))}
              </span>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: 'clamp(32px, 8vw, 44px)', color: 'var(--text-primary)', margin: '6px 0 22px', letterSpacing: '-0.03em' }}>{money(nw)}</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 9 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{pct.toFixed(1)}% of {short(goal)}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{money(remaining)} to go</span>
          </div>
          <div title={`As of ${today}`} style={{ height: 6, borderRadius: 999, background: 'var(--kpi-bg)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #1baf7a)', borderRadius: 999, transition: 'width .6s ease' }} />
          </div>

          <div style={{ display: 'flex', gap: 'clamp(16px, 4vw, 32px)', marginTop: 22 }}>
            <Piece label="Investments" value={money(d.holdingsValue)} />
            <Piece label="Cash" value={money(d.cashValue)} />
            <Piece label="Debts" value={`−${money(d.debts)}`} />
          </div>
        </div>

        {/* RIGHT — where you're headed */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Label>ETA to {short(goal)}</Label>
            {!reached && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--kpi-bg)', borderRadius: 999, padding: 3 }}>
                <Seg active={rateKey === 'c'} onClick={() => setRateKey('c')}>5%</Seg>
                <Seg active={rateKey === 'm'} onClick={() => setRateKey('m')}>7%</Seg>
                <span onClick={() => setRateKey('o')} style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 9px', borderRadius: 999, cursor: 'text', fontSize: 12, fontWeight: 600, background: rateKey === 'o' ? 'var(--surface-1)' : 'transparent', color: rateKey === 'o' ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: rateKey === 'o' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none' }} title="Editable — try any rate">
                  <input inputMode="decimal" value={customRate} aria-label="Custom return rate"
                    onFocus={() => setRateKey('o')}
                    onChange={(e) => { setCustomRate(e.target.value.replace(/[^0-9.]/g, '')); setRateKey('o') }}
                    style={{ width: 22, fontSize: 12, fontWeight: 600, textAlign: 'right', border: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit', outline: 'none', padding: 0 }} />
                  %
                </span>
              </div>
            )}
          </div>

          {reached ? (
            <div style={{ fontWeight: 700, fontSize: 'clamp(28px, 7vw, 38px)', color: 'var(--income)', margin: '6px 0 2px', letterSpacing: '-0.02em' }}>Goal reached</div>
          ) : projectable ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 'clamp(32px, 8vw, 44px)', letterSpacing: '-0.03em', margin: '6px 0 4px', color: 'var(--accent)' }}>{dateStr}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{awayStr} away · {Math.round(rate * 100 * 10) / 10}%/yr</div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 26 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Adding</span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, fontSize: 20, color: 'var(--text-secondary)' }}>$</span>
                  <input inputMode="numeric" value={override} placeholder="0"
                    onChange={(e) => setOverride(e.target.value.replace(/[^0-9.]/g, ''))}
                    style={{ width: 84, fontWeight: 700, fontSize: 20, padding: '0 2px 2px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }} />
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/mo</span>
                {Math.round(Number(override) || 0) !== Math.round(avgSave) && (
                  <button onClick={() => setOverride(String(Math.round(avgSave)))} style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>↺ my pace</button>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Add a monthly amount to see your finish date.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{children}</span>
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', background: active ? 'var(--surface-1)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none' }}>{children}</button>
  )
}

function Piece({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 16, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { getJSON } from '@/lib/fresh'

interface NW {
  netWorth: number; holdingsValue: number; cashValue: number; debts: number
  investGain?: number; investCost?: number; investReturnPct?: number | null
  history: { month: string; net: number; investments?: number; debts?: number; est?: boolean }[]
}
type Range = '3M' | '6M' | 'YTD' | '1Y' | 'ALL'
const RANGES: Range[] = ['3M', '6M', 'YTD', '1Y', 'ALL']

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const short = (n: number) => (n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n))
const addMonths = (m: string, k: number) => { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }
const monthsApart = (a: string, b: string) => { const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number); return (yb * 12 + mb) - (ya * 12 + ma) }
const fmtMonth = (m: string) => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) }

// Net worth (where you are) + real trajectory + projection to the goal — the blended
// masthead of Home (no card frame; the chart bleeds into the page).
export default function JourneyCard() {
  const [d, setD] = useState<NW | null>(null)
  const [goal, setGoal] = useState(500000)
  const [avgSave, setAvgSave] = useState<number | null>(null)
  const [rateKey, setRateKey] = useState<'c' | 'm' | 'o'>('m')
  const [override, setOverride] = useState('')        // custom monthly contribution
  const [detailsOpen, setDetailsOpen] = useState(false) // planner (rate + contribution) hidden by default
  const [range, setRange] = useState<Range>('ALL')
  const seeded = useRef(false)

  useEffect(() => { try { setDetailsOpen(localStorage.getItem('jt-nw-details') === '1') } catch { /* ignore */ } }, [])
  const toggleDetails = () => setDetailsOpen((v) => { const n = !v; try { localStorage.setItem('jt-nw-details', n ? '1' : '0') } catch { /* ignore */ } return n })

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
  const pct = Math.min(100, (nw / goal) * 100)
  const reached = nw >= goal

  const rate = rateKey === 'c' ? 0.05 : rateKey === 'm' ? 0.07 : 0.10
  const monthly = override.trim() === '' || isNaN(Number(override)) ? 0 : Math.max(0, Number(override))

  // compound month by month → ETA + projection points for the chart
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

  const history = d.history ?? []
  const hasHistory = history.length >= 2
  const nowM = hasHistory ? history[history.length - 1].month : ''

  // realized points inside the selected range
  const realWin = (() => {
    if (!hasHistory) return history
    if (range === 'ALL') return history
    if (range === 'YTD') { const y = nowM.slice(0, 4); return history.filter((h) => h.month >= `${y}-01`) }
    const n = range === '3M' ? 3 : range === '6M' ? 6 : 12
    const w = history.filter((h) => monthsApart(h.month, nowM) <= n)
    return w.length >= 2 ? w : history.slice(-2)
  })()


  return (
    <div style={{ padding: '2px 2px 0' }}>
      {/* Net worth — the hero: bigger than the supporting cards */}
      {/* big amount on the left, progress pill facing it on the right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 'clamp(36px, 10vw, 52px)', letterSpacing: '-0.035em', whiteSpace: 'nowrap', minWidth: 0 }}>{money(nw)}</div>
        {/* the pill IS the planner toggle — tap to open the goal planner */}
        <button onClick={toggleDetails} aria-expanded={detailsOpen} aria-label={detailsOpen ? 'Hide goal planner' : 'Open goal planner'}
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'baseline', gap: 5, padding: '7px 13px', borderRadius: 999, background: detailsOpen ? 'color-mix(in srgb, var(--accent) 12%, var(--kpi-bg))' : 'var(--kpi-bg)', border: `1px solid ${detailsOpen ? 'var(--accent)' : 'var(--border)'}`, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s, border-color .15s' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)', letterSpacing: '-0.01em' }}>{pct.toFixed(0)}%</span>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>of {short(goal)}</span>
        </button>
      </div>
      {!hasHistory && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Trajectory builds as months are recorded</div>}

      {/* Full-bleed trajectory chart — always auto-fits (the pill carries % of goal) */}
      {hasHistory
        ? <Spark real={realWin} proj={[]} nowM={nowM} goal={goal} anchor={false} />
        : <div style={{ height: 12 }} />}

      {/* Range chips */}
      {hasHistory && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          {RANGES.map((r) => {
            const on = range === r
            return (
              <button key={r} onClick={() => setRange(r)}
                style={{ padding: on ? '6px 15px' : '6px 8px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: on ? 700 : 600, fontFamily: 'inherit', background: on ? 'var(--surface-1)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: on ? '0 2px 8px rgba(0,0,0,0.14)' : 'none', transition: 'background .15s, color .15s, box-shadow .15s' }}>{r}</button>
            )
          })}
        </div>
      )}

      {/* Goal planner — opens from the pill; glassy like the other home cards */}
      {detailsOpen && (
        <div className="card glass" style={{ marginTop: 14, padding: 16 }}>
          {reached ? (
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--income)' }}>🎉 Goal reached</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>You’ve passed {short(goal)} — set a new goal in Settings.</div>
            </div>
          ) : (
            <>
              {/* outcome */}
              <div style={{ textAlign: 'center', paddingBottom: 13, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Reaching {short(goal)}</div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 3, color: projectable ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {projectable ? dateStr : 'Set a monthly amount'}
                </div>
                {projectable && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>
                    <b style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{awayStr}</b> away · at <b style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{Math.round(rate * 100 * 10) / 10}%</b>/yr
                  </div>
                )}
              </div>

              {/* growth rate */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Yearly growth</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--kpi-bg)', borderRadius: 999, padding: 3 }}>
                  <Seg active={rateKey === 'c'} onClick={() => setRateKey('c')}>5%</Seg>
                  <Seg active={rateKey === 'm'} onClick={() => setRateKey('m')}>7%</Seg>
                  <Seg active={rateKey === 'o'} onClick={() => setRateKey('o')}>10%</Seg>
                </div>
              </div>

              {/* monthly contribution */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Saving / month</span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 600, fontSize: 18, color: 'var(--text-secondary)' }}>$</span>
                    <input inputMode="numeric" value={override} placeholder="0"
                      onChange={(e) => setOverride(e.target.value.replace(/[^0-9.]/g, ''))}
                      style={{ width: 72, fontWeight: 800, fontSize: 18, padding: '0 2px 2px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', textAlign: 'right' }} />
                  </span>
                  {Math.round(Number(override) || 0) !== Math.round(avgSave) && (
                    <button onClick={() => setOverride(String(Math.round(avgSave)))} style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>↺ my pace</button>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// The blended sparkline — dotted area fill under the real line, faint dashed projection,
// endpoint dot, and a hover tooltip. Full width, no axes.
function Spark({ real, proj, nowM, goal, anchor }: { real: { month: string; net: number; est?: boolean }[]; proj: { month: string; net: number }[]; nowM: string; goal: number; anchor: boolean }) {
  const [hover, setHover] = useState<{ left: number; top: number; month: string; net: number; proj: boolean; est: boolean } | null>(null)
  const W = 400, H = 150, PADY = 10

  // one continuous index across real + projection tail (proj[0] === last real point)
  const tail = proj.slice(1)
  const series = real.map((p) => ({ ...p, isProj: false, isEst: !!p.est })).concat(tail.map((p) => ({ ...p, isProj: true, isEst: false })))
  if (series.length < 2) return <div style={{ height: 12 }} />
  const N = series.length - 1
  const vals = series.map((p) => p.net)
  // ALL → anchor the scale to the goal ($0 … goal) so progress reads as progress.
  // Shorter ranges → auto-fit the window so recent movement is legible.
  let lo: number, hi: number
  if (anchor) { lo = 0; hi = goal * 1.05 }
  else { lo = Math.min(...vals); hi = Math.max(...vals); const pad = (hi - lo) * 0.16 || 8; lo -= pad; hi += pad }
  const X = (i: number) => (i / N) * W
  const Y = (v: number) => PADY + (1 - (v - lo) / (hi - lo)) * (H - 2 * PADY)

  const realEnd = real.length - 1
  const solid = series.slice(0, real.length)
  const dashed = series.slice(realEnd) // last real point → through the projection tail

  // smooth (Catmull-Rom → cubic bézier) so the line flows instead of zig-zagging
  const smooth = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return pts.length ? `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}` : ''
    let dp = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6
      dp += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    }
    return dp
  }
  const solidCoords = solid.map((p, k) => ({ x: X(k), y: Y(p.net) }))
  const dashedCoords = dashed.map((p, k) => ({ x: X(realEnd + k), y: Y(p.net) }))
  const dashedPath = smooth(dashedCoords)
  const area = `${smooth(solidCoords)} L ${X(realEnd).toFixed(1)} ${H} L ${X(0).toFixed(1)} ${H} Z`

  // split the realized line into an estimated (pre-real-data) stretch + the real stretch
  const firstRealIdx = solid.findIndex((p) => !p.isEst)
  const hasEst = firstRealIdx > 0
  const realStart = hasEst ? firstRealIdx : 0
  const estPath = hasEst ? smooth(solid.slice(0, firstRealIdx + 1).map((p, k) => ({ x: X(k), y: Y(p.net) }))) : ''
  const realPath = smooth(solid.slice(realStart).map((p, k) => ({ x: X(realStart + k), y: Y(p.net) })))

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    let bi = 0, bd = 1e9
    series.forEach((_, i) => { const dd = Math.abs(X(i) - px); if (dd < bd) { bd = dd; bi = i } })
    const p = series[bi]
    setHover({ left: (X(bi) / W) * 100, top: (Y(p.net) / H) * 100, month: p.month, net: p.net, proj: p.isProj, est: p.isEst })
  }

  return (
    <div style={{ position: 'relative', marginTop: 14 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 'clamp(120px, 34vw, 168px)' }}
        onPointerMove={move} onPointerLeave={() => setHover(null)} role="img" aria-label="Net worth over time">
        <defs>
          <linearGradient id="nwfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          {/* horizontal fade so the fill dissolves at the "now" edge instead of a hard wall */}
          <linearGradient id="nwfade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset={Math.max(0, X(realEnd) / W - 0.07)} stopColor="#fff" stopOpacity="1" />
            <stop offset={X(realEnd) / W} stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="nwmask"><rect x="0" y="0" width={W} height={H} fill="url(#nwfade)" /></mask>
        </defs>
        <path d={area} fill="url(#nwfill)" mask="url(#nwmask)" />
        {dashed.length > 1 && (
          <path d={dashedPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 4" opacity={0.4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        {hasEst && (
          <path d={estPath} fill="none" stroke="var(--accent)" strokeWidth={1.6} opacity={0.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        <path d={realPath} fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* dots as HTML overlays so they stay round (the SVG is non-uniformly scaled) */}
      <Dot left={(X(realEnd) / W) * 100} top={(Y(real[real.length - 1].net) / H) * 100} />
      {hover && <Dot left={hover.left} top={hover.top} />}
      {hover && (
        <div style={{ position: 'absolute', left: `${hover.left}%`, top: `${hover.top}%`, transform: 'translate(-50%, -115%)', pointerEvents: 'none', background: 'var(--text-primary)', color: 'var(--surface-1)', borderRadius: 9, padding: '6px 9px', fontSize: 12, lineHeight: 1.3, whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{fmtMonth(hover.month)}{hover.proj ? ' · proj.' : hover.est ? ' · est.' : ''}</span>&nbsp; <b style={{ fontWeight: 700 }}>{money(hover.net)}</b>
        </div>
      )}
    </div>
  )
}

function Dot({ left, top }: { left: number; top: number }) {
  return <div style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)', width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--surface-1)', boxShadow: '0 1px 4px rgba(0,0,0,0.22)', pointerEvents: 'none' }} />
}


function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', background: active ? 'var(--surface-1)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none' }}>{children}</button>
  )
}

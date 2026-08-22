'use client'

import { useEffect, useRef, useState } from 'react'
import { getJSON } from '@/lib/fresh'

// A flick-able coin that spins with natural deceleration, then reveals a
// motivational "aha" card built from your real journey numbers.
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const short = (n: number) => (n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n))

interface Boost { emoji: string; text: string }

export default function CoinBoost() {
  const [angle, setAngle] = useState(0)     // rotateY, degrees
  const [spinning, setSpinning] = useState(false)
  const [boost, setBoost] = useState<Boost | null>(null)
  const velRef = useRef(0)
  const angRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; t: number } | null>(null)
  const data = useRef<{ nw?: any; goal: number; monthly?: any[] }>({ goal: 500000 })

  useEffect(() => {
    getJSON('/api/networth').then((d) => { if (!d.error) data.current.nw = d }).catch(() => {})
    getJSON('/api/settings').then((s) => { if (!s.error && s.goalAmount) data.current.goal = Number(s.goalAmount) }).catch(() => {})
    getJSON('/api/charts').then((d) => { if (Array.isArray(d.monthly)) data.current.monthly = d.monthly }).catch(() => {})
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  // build the message pool from real data + evergreen motivation
  const pool = (): Boost[] => {
    const out: Boost[] = [
      { emoji: '🌱', text: 'Consistency compounds. Keep stacking.' },
      { emoji: '👣', text: 'Small steps today, big net worth tomorrow.' },
      { emoji: '🙌', text: 'Future you is already thanking you.' },
      { emoji: '🧭', text: 'You’re the CFO of this household. Steady hands.' },
    ]
    const nw = data.current.nw, goal = data.current.goal
    if (nw) {
      const pct = Math.round(Math.min(100, (nw.netWorth / goal) * 100))
      out.push({ emoji: '🎯', text: `You’re ${pct}% of the way to ${short(goal)}.` })
      out.push({ emoji: '💰', text: `Net worth today: ${money(nw.netWorth)} — and climbing.` })
      const hist = nw.history as any[] | undefined
      if (hist && hist.length >= 2) {
        const diff = nw.netWorth - hist[hist.length - 2].net
        if (Math.abs(diff) > 50) out.push({ emoji: diff >= 0 ? '🚀' : '💪', text: `Net worth ${diff >= 0 ? 'up' : 'down'} ${money(Math.abs(diff))} this month.` })
      }
    }
    const m = data.current.monthly
    if (m && m.length) {
      const cur = m[m.length - 1]
      if (cur.income > 0) {
        const rate = Math.round((cur.savings / cur.income) * 100)
        if (rate > 0) out.push({ emoji: '🔥', text: `You saved ${rate}% of your income this month.` })
      }
    }
    return out
  }

  const stopAndReveal = () => {
    const snapped = Math.round(angRef.current / 180) * 180
    angRef.current = snapped; setAngle(snapped)
    velRef.current = 0; rafRef.current = null; setSpinning(false)
    const p = pool()
    setBoost(p[Math.floor(Math.random() * p.length)])
  }

  const tick = () => {
    velRef.current *= 0.972 // friction → gentle deceleration
    angRef.current += velRef.current
    setAngle(angRef.current)
    if (Math.abs(velRef.current) < 0.7) { stopAndReveal(); return }
    rafRef.current = requestAnimationFrame(tick)
  }

  const startSpin = (vel: number) => {
    setBoost(null); setSpinning(true)
    velRef.current = vel
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }

  const onDown = (e: React.PointerEvent) => { startRef.current = { x: e.clientX, t: performance.now() } }
  const onUp = (e: React.PointerEvent) => {
    const s = startRef.current; startRef.current = null
    if (!s || spinning) return
    const dx = e.clientX - s.x, dt = Math.max(1, performance.now() - s.t)
    let vel: number
    if (Math.abs(dx) > 8) vel = Math.max(24, Math.min(46, Math.abs(dx / dt) * 22)) * (dx < 0 ? -1 : 1) // swipe
    else vel = (Math.random() > 0.5 ? 1 : -1) * (28 + Math.random() * 8)                                 // tap
    startSpin(vel)
  }

  const faceBase: React.CSSProperties = {
    position: 'absolute', inset: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.3), inset 0 -4px 9px rgba(0,0,0,0.28), 0 6px 18px rgba(0,0,0,0.28)',
  }

  return (
    <div className="card glass" style={{ textAlign: 'center', padding: '18px 16px 20px' }}>
      <span className="hdr-label">Daily boost</span>

      <div style={{ perspective: 520, display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <button type="button" onPointerDown={onDown} onPointerUp={onUp} aria-label="Flick the coin for a boost"
          style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', touchAction: 'pan-y' }}>
          <div style={{ position: 'relative', width: 72, height: 72, transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d', transform: `rotateY(${angle}deg)`, transition: spinning ? 'none' : 'transform .2s ease' }}>
            {/* rim — a metallic edge so the coin has thickness and never fully vanishes */}
            <div style={{ position: 'absolute', top: 2, bottom: 2, left: '50%', width: 9, marginLeft: -4.5, borderRadius: 5, transform: 'rotateY(90deg)', backfaceVisibility: 'visible', WebkitBackfaceVisibility: 'visible', background: 'linear-gradient(180deg, #b9822f 0%, #f4dd9a 22%, #8a5e1e 50%, #f4dd9a 78%, #b9822f 100%)' }} />
            {/* front — gold $ */}
            <div style={{ ...faceBase, transform: 'translateZ(4px)', background: 'radial-gradient(circle at 32% 26%, #fdeeb4, #e7b24e 46%, #b9822f 78%, #8a5e1e)', color: '#6e4a17', fontWeight: 800, fontSize: 34, fontFamily: 'Georgia, serif', textShadow: '0 1px 0 rgba(255,255,255,0.4), 0 -1px 0 rgba(0,0,0,0.25)' }}>$</div>
            {/* back — gold smiley */}
            <div style={{ ...faceBase, transform: 'rotateY(180deg) translateZ(4px)', background: 'radial-gradient(circle at 32% 26%, #fdeeb4, #e7b24e 46%, #b9822f 78%, #8a5e1e)', color: '#6e4a17' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <circle cx="9" cy="10" r="1.6" fill="#6e4a17" />
                <circle cx="15" cy="10" r="1.6" fill="#6e4a17" />
                <path d="M8 14c1.4 1.9 6.6 1.9 8 0" stroke="#6e4a17" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </button>
      </div>

      {/* hint or the revealed boost card */}
      <div style={{ minHeight: 52, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {boost ? (
          <div key={boost.text} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, maxWidth: 340, padding: '11px 15px', borderRadius: 14, background: 'var(--kpi-bg)', border: '1px solid var(--border)', animation: 'boostIn .35s ease' }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{boost.emoji}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'left', lineHeight: 1.4 }}>{boost.text}</span>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{spinning ? '…' : 'Flick or tap the coin for a boost'}</span>
        )}
      </div>
    </div>
  )
}

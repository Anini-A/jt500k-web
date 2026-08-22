'use client'

import { useEffect, useRef, useState } from 'react'
import { getJSON } from '@/lib/fresh'

// A free-standing flick-able gold coin (canvas-rendered) that spins with natural
// deceleration, then reveals a motivational "aha" line — Gemini-written when
// available, otherwise built from the household's real numbers.
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const short = (n: number) => (n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n))

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

export default function CoinBoost() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [spinning, setSpinning] = useState(false)
  const [boost, setBoost] = useState<string | null>(null)
  const velRef = useRef(0)
  const angRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; t: number } | null>(null)
  const spinningRef = useRef(false)
  const queue = useRef<string[]>([])   // Gemini lines waiting to be shown
  const data = useRef<{ nw?: any; goal: number; monthly?: any[] }>({ goal: 500000 })

  // ---- draw the coin at a given Y-rotation ----
  const draw = (angleDeg: number) => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const size = 112
    if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; canvas.style.width = size + 'px'; canvas.style.height = size + 'px' }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    const cx = size / 2, cy = size / 2 - 2, R = 42, TH = 9
    const a = angleDeg * Math.PI / 180
    const c = Math.cos(a), s = Math.sin(a)
    const ac = Math.abs(c), as = Math.abs(s)

    // ground shadow
    ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#000'
    ctx.beginPath(); ctx.ellipse(cx, cy + R + 8, R * ac * 0.8 + 7, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()

    // edge band (thickness)
    const edgeW = TH * as
    if (edgeW > 0.4) {
      const g = ctx.createLinearGradient(0, cy - R, 0, cy + R)
      g.addColorStop(0, '#7a521a'); g.addColorStop(0.18, '#f6df9c'); g.addColorStop(0.5, '#a9761f'); g.addColorStop(0.82, '#f6df9c'); g.addColorStop(1, '#7a521a')
      roundRect(ctx, cx - edgeW / 2, cy - R, edgeW, 2 * R, edgeW / 2); ctx.fillStyle = g; ctx.fill()
    }

    // face (foreshortened by |cos|)
    if (R * ac > 0.4) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(ac, 1)
      const fg = ctx.createRadialGradient(-R * 0.32, -R * 0.34, R * 0.1, 0, 0, R * 1.15)
      fg.addColorStop(0, '#fdeeb4'); fg.addColorStop(0.45, '#e9b855'); fg.addColorStop(0.8, '#bb8430'); fg.addColorStop(1, '#8a5e1e')
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = fg; ctx.fill()
      ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.beginPath(); ctx.arc(0, 0, R - 3, 0, Math.PI * 2); ctx.stroke()
      ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(110,74,23,0.35)'; ctx.beginPath(); ctx.arc(0, 0, R - 6.5, 0, Math.PI * 2); ctx.stroke()
      // engraving: $ on the front, smiley on the back
      ctx.fillStyle = '#6e4a17'; ctx.strokeStyle = '#6e4a17'
      if (c >= 0) { ctx.font = '800 48px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 3) }
      else {
        ctx.beginPath(); ctx.arc(-10, -7, 2.6, 0, Math.PI * 2); ctx.arc(10, -7, 2.6, 0, Math.PI * 2); ctx.fill()
        ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, -3, 16, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke()
      }
      // specular sweep
      const spec = ctx.createLinearGradient(-R, -R, R * 0.5, R)
      spec.addColorStop(0, 'rgba(255,255,255,0.4)'); spec.addColorStop(0.4, 'rgba(255,255,255,0)'); spec.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.globalCompositeOperation = 'screen'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = spec; ctx.fill(); ctx.globalCompositeOperation = 'source-over'
      ctx.restore()
    }
  }

  // ---- data + Gemini prefetch ----
  useEffect(() => {
    getJSON('/api/networth').then((d) => { if (!d.error) data.current.nw = d }).catch(() => {})
    getJSON('/api/settings').then((s) => { if (!s.error && s.goalAmount) data.current.goal = Number(s.goalAmount) }).catch(() => {})
    getJSON('/api/charts').then((d) => { if (Array.isArray(d.monthly)) data.current.monthly = d.monthly }).catch(() => {})
    fetchBoost(); fetchBoost()
    draw(0)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchBoost = () => {
    getJSON('/api/boost').then((d) => { if (d?.text) queue.current.push(String(d.text)) }).catch(() => {})
  }

  // local, data-driven fallback lines
  const localLine = (): string => {
    const out: string[] = [
      'Consistency compounds. Keep stacking. 🌱',
      'Small steps today, big net worth tomorrow. 👣',
      'Future you is already thanking you. 🙌',
    ]
    const nw = data.current.nw, goal = data.current.goal
    if (nw) {
      const pct = Math.round(Math.min(100, (nw.netWorth / goal) * 100))
      out.push(`You’re ${pct}% of the way to ${short(goal)}. 🎯`)
      const hist = nw.history as any[] | undefined
      if (hist && hist.length >= 2) {
        const diff = nw.netWorth - hist[hist.length - 2].net
        if (Math.abs(diff) > 50) out.push(`Net worth ${diff >= 0 ? 'up' : 'down'} ${money(Math.abs(diff))} this month. ${diff >= 0 ? '🚀' : '💪'}`)
      }
    }
    const m = data.current.monthly
    if (m && m.length) { const cur = m[m.length - 1]; if (cur.income > 0) { const r = Math.round((cur.savings / cur.income) * 100); if (r > 0) out.push(`You saved ${r}% of your income this month. 🔥`) } }
    return out[Math.floor(Math.random() * out.length)]
  }

  const stopAndReveal = () => {
    const snapped = Math.round(angRef.current / 180) * 180
    angRef.current = snapped; draw(snapped)
    velRef.current = 0; rafRef.current = null; spinningRef.current = false; setSpinning(false)
    setBoost(queue.current.shift() || localLine())
    fetchBoost() // keep one warm for next time
  }

  const tick = () => {
    velRef.current *= 0.972
    angRef.current += velRef.current
    draw(angRef.current)
    if (Math.abs(velRef.current) < 0.7) { stopAndReveal(); return }
    rafRef.current = requestAnimationFrame(tick)
  }

  const startSpin = (vel: number) => {
    setBoost(null); spinningRef.current = true; setSpinning(true)
    velRef.current = vel
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }

  const onDown = (e: React.PointerEvent) => { startRef.current = { x: e.clientX, t: performance.now() } }
  const onUp = (e: React.PointerEvent) => {
    const st = startRef.current; startRef.current = null
    if (!st || spinningRef.current) return
    const dx = e.clientX - st.x, dt = Math.max(1, performance.now() - st.t)
    const vel = Math.abs(dx) > 8
      ? Math.max(26, Math.min(48, Math.abs(dx / dt) * 22)) * (dx < 0 ? -1 : 1)   // flick
      : (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 8)                // tap
    startSpin(vel)
  }

  return (
    <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
      <button type="button" onPointerDown={onDown} onPointerUp={onUp} aria-label="Flick the coin for a boost"
        style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', touchAction: 'pan-y', lineHeight: 0 }}>
        <canvas ref={canvasRef} />
      </button>
      <div style={{ minHeight: 40, marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
        {boost ? (
          <span key={boost} style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 320, lineHeight: 1.4, animation: 'boostIn .35s ease' }}>{boost}</span>
        ) : (
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{spinning ? '' : 'Flick the coin'}</span>
        )}
      </div>
    </div>
  )
}

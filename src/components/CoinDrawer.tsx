'use client'

import { useEffect, useRef, useState } from 'react'
import Coin3D from './Coin3D'
import { getJSON } from '@/lib/fresh'

// Hidden bottom drawer: a hard swipe-up (when the page is at the bottom) reveals
// a free-standing 3D coin. Flick the coin → it spins, settles, and shows a
// motivational "aha" line (Gemini-written, with a local data-driven fallback).
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const short = (n: number) => (n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n))
const PANEL = 340

export default function CoinDrawer() {
  const [open, setOpen] = useState(false)
  const [peek, setPeek] = useState(0)      // px revealed while dragging
  const [dragging, setDragging] = useState(false)
  const [boost, setBoost] = useState<string | null>(null)
  const queue = useRef<string[]>([])
  const data = useRef<{ nw?: any; goal: number; monthly?: any[] }>({ goal: 500000 })
  const g = useRef<{ y0: number; t0: number; armed: boolean; down: boolean }>({ y0: 0, t0: 0, armed: false, down: false })

  useEffect(() => {
    getJSON('/api/networth').then((d) => { if (!d.error) data.current.nw = d }).catch(() => {})
    getJSON('/api/settings').then((s) => { if (!s.error && s.goalAmount) data.current.goal = Number(s.goalAmount) }).catch(() => {})
    getJSON('/api/charts').then((d) => { if (Array.isArray(d.monthly)) data.current.monthly = d.monthly }).catch(() => {})
    fetchBoost(); fetchBoost()
  }, [])

  const fetchBoost = () => { getJSON('/api/boost').then((d) => { if (d?.text) queue.current.push(String(d.text)) }).catch(() => {}) }

  const localLine = (): string => {
    const out = ['Consistency compounds. Keep stacking. 🌱', 'Small steps today, big net worth tomorrow. 👣', 'Future you is already thanking you. 🙌']
    const nw = data.current.nw, goal = data.current.goal
    if (nw) {
      out.push(`You’re ${Math.round(Math.min(100, (nw.netWorth / goal) * 100))}% of the way to ${short(goal)}. 🎯`)
      const h = nw.history as any[] | undefined
      if (h && h.length >= 2) { const diff = nw.netWorth - h[h.length - 2].net; if (Math.abs(diff) > 50) out.push(`Net worth ${diff >= 0 ? 'up' : 'down'} ${money(Math.abs(diff))} this month. ${diff >= 0 ? '🚀' : '💪'}`) }
    }
    const m = data.current.monthly
    if (m && m.length) { const c = m[m.length - 1]; if (c.income > 0) { const r = Math.round((c.savings / c.income) * 100); if (r > 0) out.push(`You saved ${r}% of your income this month. 🔥`) } }
    return out[Math.floor(Math.random() * out.length)]
  }

  const reveal = () => { setBoost(queue.current.shift() || localLine()); fetchBoost() }

  // ── swipe-up-at-bottom to open ──
  useEffect(() => {
    const atBottom = () => (window.scrollY || document.documentElement.scrollTop || 0) + window.innerHeight >= document.documentElement.scrollHeight - 8
    const onStart = (e: TouchEvent) => {
      if (open || e.touches.length !== 1) { g.current.armed = false; return }
      g.current = { y0: e.touches[0].clientY, t0: performance.now(), armed: atBottom(), down: false }
    }
    const onMove = (e: TouchEvent) => {
      if (!g.current.armed || open) return
      const dy = g.current.y0 - e.touches[0].clientY // up = positive
      if (dy > 0) { setDragging(true); setPeek(Math.min(PANEL, dy)) } else setPeek(0)
    }
    const onEnd = (e: TouchEvent) => {
      if (!g.current.armed) return
      const dy = g.current.y0 - e.changedTouches[0].clientY
      const dt = Math.max(1, performance.now() - g.current.t0)
      setDragging(false)
      g.current.armed = false
      if (dy > 110 || (dy > 50 && dy / dt > 0.6)) { setOpen(true); setPeek(0) } // hard/fast swipe up
      else setPeek(0)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd) }
  }, [open])

  const close = () => { setOpen(false); setPeek(0); setBoost(null) }

  // swipe down on the panel to dismiss
  const onPanelStart = (e: React.TouchEvent) => { g.current.y0 = e.touches[0].clientY; g.current.down = true }
  const onPanelEnd = (e: React.TouchEvent) => { if (g.current.down && e.changedTouches[0].clientY - g.current.y0 > 70) close(); g.current.down = false }

  const translate = open ? 0 : PANEL - peek
  const visible = open || peek > 2

  return (
    <>
      {(open || peek > 40) && <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 179, background: `rgba(10,10,10,${open ? 0.4 : Math.min(0.4, peek / PANEL * 0.4)})`, transition: dragging ? 'none' : 'background .25s', WebkitBackdropFilter: 'blur(2px)', backdropFilter: 'blur(2px)' }} />}
      <div onTouchStart={onPanelStart} onTouchEnd={onPanelEnd}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 180, height: PANEL, paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: `translateY(${translate}px)`, transition: dragging ? 'none' : 'transform .34s cubic-bezier(.2,.9,.3,1)',
          borderRadius: '26px 26px 0 0', background: 'var(--glass-specular), var(--glass-bg)', WebkitBackdropFilter: 'blur(30px) saturate(180%)', backdropFilter: 'blur(30px) saturate(180%)',
          border: '1px solid var(--glass-border)', borderBottom: 'none', boxShadow: '0 -10px 40px rgba(20,20,25,0.22)',
          display: visible ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--border)', position: 'absolute', top: 9 }} />
        <Coin3D size={140} onSpinStart={() => setBoost(null)} onSpinStop={reveal} />
        <div style={{ minHeight: 42, marginTop: 4, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          {boost && <span key={boost} style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 340, lineHeight: 1.4, animation: 'boostIn .35s ease' }}>{boost}</span>}
        </div>
      </div>
    </>
  )
}

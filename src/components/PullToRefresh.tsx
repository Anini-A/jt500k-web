'use client'

import { useEffect, useRef, useState } from 'react'
import { today } from '@/lib/date'

// Pull down from the top of the page to refresh live prices + reload all data.
// (Native pull-to-refresh is disabled by overscroll-behavior:none, so this is custom.)
const MAX = 90        // dampened cap
const THRESHOLD = 58  // pull past this to trigger

export default function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const setP = (v: number) => { pullRef.current = v; setPull(v) }

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0
    const onStart = (e: TouchEvent) => {
      // don't hijack a pull inside an open modal/sheet
      if (refreshing || e.touches.length !== 1 || document.querySelector('.modal-backdrop') || !atTop()) { startY.current = null; return }
      startY.current = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0 && atTop()) setP(Math.min(dy * 0.5, MAX))
      else setP(0)
    }
    const onEnd = async () => {
      if (startY.current === null) return
      startY.current = null
      if (pullRef.current < THRESHOLD) { setP(0); return }
      setRefreshing(true); setP(0)
      try {
        await fetch('/api/holdings/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ today: today() }) })
        try { localStorage.setItem('jt-holdings-refreshed', String(Date.now())) } catch { /* ignore */ }
      } catch { /* refresh anyway */ }
      window.location.reload()
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [refreshing, pull])

  const active = refreshing || pull > 4
  // rest at the header-icon line; slide up out of view when idle
  const REST = 20, HIDDEN = -52
  const y = refreshing ? REST : HIDDEN + (Math.min(pull, MAX) / MAX) * (REST - HIDDEN)

  return (
    <div aria-hidden style={{
      position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: 0, right: 0, zIndex: 150,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      transform: `translateY(${y}px)`, transition: startY.current === null ? 'transform .3s cubic-bezier(.2,.9,.3,1), opacity .2s' : 'none',
      opacity: active ? 1 : 0,
    }}>
      {/* iOS-style spokes spinner: rotates with the pull, spins while refreshing */}
      <div style={{
        position: 'relative', width: 30, height: 30, color: 'var(--text-secondary)',
        transform: refreshing ? undefined : `rotate(${pull * 4}deg)`,
        animation: refreshing ? 'spin 0.9s steps(12) infinite' : 'none',
      }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{ position: 'absolute', inset: 0, transform: `rotate(${i * 30}deg)` }}>
            <div style={{ position: 'absolute', left: '50%', top: '5%', width: 2.6, height: '26%', marginLeft: -1.3, borderRadius: 3, background: 'currentColor', opacity: 0.12 + (i / 11) * 0.78 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

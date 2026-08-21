'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
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
      try { await fetch('/api/holdings/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ today: today() }) }) } catch { /* refresh anyway */ }
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
  const y = (refreshing ? 46 : pull) - 44
  const armed = pull >= THRESHOLD || refreshing

  return (
    <div aria-hidden style={{
      position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: 0, right: 0, zIndex: 150,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      transform: `translateY(${y}px)`, transition: startY.current === null ? 'transform .25s ease, opacity .2s' : 'none',
      opacity: active ? 1 : 0,
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 999, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw size={16} style={{ color: armed ? 'var(--accent)' : 'var(--text-muted)', transform: refreshing ? 'none' : `rotate(${pull * 3}deg)`, animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
      </div>
    </div>
  )
}

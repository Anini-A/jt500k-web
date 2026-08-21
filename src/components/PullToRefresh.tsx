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
  // rest at the header-icon line; slide up out of view when idle
  const REST = 20, HIDDEN = -52
  const y = refreshing ? REST : HIDDEN + (Math.min(pull, MAX) / MAX) * (REST - HIDDEN)

  const faceBase: React.CSSProperties = {
    position: 'absolute', inset: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.28), inset 0 -3px 7px rgba(0,0,0,0.28), 0 5px 14px rgba(0,0,0,0.28)',
  }

  return (
    <div aria-hidden style={{
      position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: 0, right: 0, zIndex: 150,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      transform: `translateY(${y}px)`, transition: startY.current === null ? 'transform .3s cubic-bezier(.2,.9,.3,1), opacity .2s' : 'none',
      opacity: active ? 1 : 0,
    }}>
      <div style={{ perspective: 360 }}>
        <div style={{
          position: 'relative', width: 40, height: 40, transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d',
          transform: refreshing ? undefined : `rotateY(${pull * 4}deg)`,
          animation: refreshing ? 'coinFlip 0.9s linear infinite' : 'none',
        }}>
          {/* front — gold $ */}
          <div style={{ ...faceBase, background: 'radial-gradient(circle at 32% 26%, #fdeeb4, #e7b24e 46%, #b9822f 78%, #8a5e1e)', color: '#6e4a17', fontWeight: 800, fontSize: 19, fontFamily: 'Georgia, serif', textShadow: '0 1px 0 rgba(255,255,255,0.4), 0 -1px 0 rgba(0,0,0,0.25)' }}>$</div>
          {/* back — silver smiley */}
          <div style={{ ...faceBase, transform: 'rotateY(180deg)', background: 'radial-gradient(circle at 32% 26%, #ffffff, #d4dce4 46%, #9aa6b2 78%, #7c8794)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="10" r="1.5" fill="#5a636d" />
              <circle cx="15" cy="10" r="1.5" fill="#5a636d" />
              <path d="M8 14c1.4 1.8 6.6 1.8 8 0" stroke="#5a636d" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

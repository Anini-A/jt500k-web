'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Key = 'transactions' | 'home' | 'dashboard'
// left → right order. Swipe right advances toward Dashboard, left toward Transactions.
const PAGES: { key: Key; label: string; href: string }[] = [
  { key: 'transactions', label: 'Transactions', href: '/transactions' },
  { key: 'home', label: 'Home', href: '/' },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
]

// does the touch start inside a horizontally-scrollable element? (don't hijack it)
function inHScroll(el: EventTarget | null): boolean {
  let n = el as HTMLElement | null
  while (n && n !== document.body) {
    const s = getComputedStyle(n)
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true
    n = n.parentElement
  }
  return false
}

// Top-center section switcher: tap a segment, or swipe left/right to change page.
export default function PagePill({ current }: { current: Key }) {
  const router = useRouter()
  const idx = PAGES.findIndex((p) => p.key === current)

  useEffect(() => {
    let x0 = 0, y0 = 0, active = false
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { active = false; return }
      const t = e.touches[0]
      // ignore near screen edges (iOS back gesture) and inside horizontal scrollers
      if (t.clientX < 24 || t.clientX > window.innerWidth - 24 || inHScroll(e.target)) { active = false; return }
      x0 = t.clientX; y0 = t.clientY; active = true
    }
    const onEnd = (e: TouchEvent) => {
      if (!active) return
      active = false
      const t = e.changedTouches[0]
      const dx = t.clientX - x0, dy = t.clientY - y0
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return // not a clear horizontal swipe
      const next = idx + (dx > 0 ? 1 : -1) // swipe right → toward Dashboard
      if (next >= 0 && next < PAGES.length) router.push(PAGES[next].href)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd) }
  }, [idx, router])

  return (
    <div className="page-pill" role="tablist" aria-label="Sections">
      {PAGES.map((p) => (
        <button key={p.key} role="tab" aria-selected={p.key === current}
          className={`page-seg ${p.key === current ? 'active' : ''}`}
          onClick={() => { if (p.key !== current) router.push(p.href) }}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { nav } from '@/lib/nav'

type Key = 'transactions' | 'home' | 'dashboard'
// left → right order. Swipe right advances toward Dashboard, left toward Transactions.
const PAGES: { key: Key; label: string; href: string }[] = [
  { key: 'transactions', label: 'Transactions', href: '/transactions' },
  { key: 'home', label: 'Home', href: '/' },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
]

// nearest horizontally-scrollable ancestor (so a chip row scrolls instead of paging)
function hScroller(el: EventTarget | null): HTMLElement | null {
  let n = el as HTMLElement | null
  while (n && n !== document.body) {
    const s = getComputedStyle(n)
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) return n
    n = n.parentElement
  }
  return null
}

// Top-center switcher: shows ONLY the current section; chevrons or a swipe move.
export default function PagePill({ current }: { current: Key }) {
  const router = useRouter()
  const idx = PAGES.findIndex((p) => p.key === current)

  const go = (next: number) => {
    if (next < 0 || next >= PAGES.length || next === idx) return
    nav.dir = next > idx ? 1 : -1 // remember the slide direction for the transition
    router.push(PAGES[next].href)
  }

  useEffect(() => {
    let x0 = 0, y0 = 0, active = false, scroller: HTMLElement | null = null
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { active = false; return }
      const t = e.touches[0]
      // only the extreme edges are off-limits (iOS system gestures)
      if (t.clientX < 16 || t.clientX > window.innerWidth - 16) { active = false; return }
      x0 = t.clientX; y0 = t.clientY; active = true
      scroller = hScroller(e.target) // remember any horizontal scroller under the finger
    }
    const onEnd = (e: TouchEvent) => {
      if (!active) return
      active = false
      const t = e.changedTouches[0]
      const dx = t.clientX - x0, dy = t.clientY - y0
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return
      // if a chip row can still scroll the way you swiped, let it scroll instead of paging
      if (scroller) {
        const atStart = scroller.scrollLeft <= 1
        const atEnd = scroller.scrollLeft >= scroller.scrollWidth - scroller.clientWidth - 1
        if (dx > 0 && !atStart) return // swipe right but the row can still scroll toward its start
        if (dx < 0 && !atEnd) return   // swipe left but the row can still scroll toward its end
      }
      go(idx + (dx < 0 ? 1 : -1)) // swipe left → Dashboard, swipe right → Transactions
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd) }
  }, [idx]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page-pill">
      {/* desktop: full clickable segmented control */}
      <div className="page-segs">
        {PAGES.map((p, i) => (
          <button key={p.key} className={`page-seg ${i === idx ? 'active' : ''}`} onClick={() => go(i)} aria-current={i === idx}>{p.label}</button>
        ))}
      </div>
      {/* mobile: a pill — · Label · — swipe (or tap a dot) to change */}
      <div className="page-compact">
        <button className="page-edge" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous section" />
        <span className="page-current" aria-live="polite">{PAGES[idx].label}</span>
        <button className="page-edge" onClick={() => go(idx + 1)} disabled={idx === PAGES.length - 1} aria-label="Next section" />
      </div>
    </div>
  )
}

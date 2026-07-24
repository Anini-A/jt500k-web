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

function inHScroll(el: EventTarget | null): boolean {
  let n = el as HTMLElement | null
  while (n && n !== document.body) {
    const s = getComputedStyle(n)
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true
    n = n.parentElement
  }
  return false
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
    let x0 = 0, y0 = 0, active = false
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { active = false; return }
      const t = e.touches[0]
      if (t.clientX < 24 || t.clientX > window.innerWidth - 24 || inHScroll(e.target)) { active = false; return }
      x0 = t.clientX; y0 = t.clientY; active = true
    }
    const onEnd = (e: TouchEvent) => {
      if (!active) return
      active = false
      const t = e.changedTouches[0]
      const dx = t.clientX - x0, dy = t.clientY - y0
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return
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

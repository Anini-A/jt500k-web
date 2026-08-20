'use client'

import { useRouter } from 'next/navigation'
import { nav } from '@/lib/nav'

type Key = 'transactions' | 'home' | 'dashboard'
// left → right order (matches the bottom bar).
const PAGES: { key: Key; label: string; href: string }[] = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'transactions', label: 'Transactions', href: '/transactions' },
]

// Top-center switcher: shows ONLY the current section; tap a chevron to move.
export default function PagePill({ current }: { current: Key }) {
  const router = useRouter()
  const idx = PAGES.findIndex((p) => p.key === current)

  const go = (next: number) => {
    if (next < 0 || next >= PAGES.length || next === idx) return
    nav.dir = next > idx ? 1 : -1 // remember the slide direction for the transition
    router.push(PAGES[next].href)
  }

  return (
    <div className="page-pill">
      {/* desktop: full clickable segmented control */}
      <div className="page-segs">
        {PAGES.map((p, i) => (
          <button key={p.key} className={`page-seg ${i === idx ? 'active' : ''}`} onClick={() => go(i)} aria-current={i === idx}>{p.label}</button>
        ))}
      </div>
      {/* mobile: a pill — · Label · — tap an edge to change */}
      <div className="page-compact">
        <button className="page-edge" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous section" />
        <span className="page-current" aria-live="polite">{PAGES[idx].label}</span>
        <button className="page-edge" onClick={() => go(idx + 1)} disabled={idx === PAGES.length - 1} aria-label="Next section" />
      </div>
    </div>
  )
}

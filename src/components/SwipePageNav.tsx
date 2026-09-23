'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { nav, PAGES } from '@/lib/nav'

// Swipe left/right anywhere on Home, Dashboard or Transactions to move between them,
// same order as the top pill and bottom bar (and reusing their exact slide-direction
// mechanism — nav.dir — so a swipe animates identically to tapping either of those).
//
// Purely passive: never calls preventDefault, so it can never fight a real scroll —
// it only ever *reacts* to touches after the fact, deciding once per gesture whether
// what already happened looks like an intentional horizontal swipe.
const SWIPE_MIN = 60    // px of horizontal travel to commit to a page change
const LOCK_AT = 8       // px before the gesture's axis is decided at all
const LOCK_RATIO = 1.3  // how much more horizontal than vertical to call it a swipe, not a scroll

// Any ancestor that scrolls sideways gets first claim on a horizontal drag — the
// dashboard's section carousel, filter-chip rows, any future horizontally-scrolling
// strip. Detected generically (computed overflow-x + actual overflow) rather than by
// class name, so a new scroll strip never has to remember to opt out of this.
function insideHorizontalScroller(el: Element | null): boolean {
  let node = el
  while (node && node !== document.body) {
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node)
      if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1) return true
    }
    node = node.parentElement
  }
  return false
}

export default function SwipePageNav() {
  const pathname = usePathname()
  const router = useRouter()
  const start = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<'h' | 'v' | null>(null)
  const excluded = useRef(false)

  useEffect(() => {
    const idx = PAGES.findIndex((p) => p.href === pathname)
    if (idx < 0) return // not one of the three swipeable top-level pages

    const onStart = (e: TouchEvent) => {
      // Don't arm inside an open modal/sheet — swiping there shouldn't navigate
      // whatever's underneath it.
      if (e.touches.length !== 1 || document.querySelector('.modal-backdrop')) { start.current = null; return }
      const t = e.touches[0]
      start.current = { x: t.clientX, y: t.clientY }
      axis.current = null
      excluded.current = insideHorizontalScroller(e.target as Element) || !!(e.target as Element).closest?.('.bottom-nav')
    }

    const onMove = (e: TouchEvent) => {
      if (!start.current || excluded.current || axis.current) return
      const t = e.touches[0]
      const dx = t.clientX - start.current.x
      const dy = t.clientY - start.current.y
      if (Math.abs(dx) < LOCK_AT && Math.abs(dy) < LOCK_AT) return
      axis.current = Math.abs(dx) > Math.abs(dy) * LOCK_RATIO ? 'h' : 'v'
    }

    const onEnd = (e: TouchEvent) => {
      const s = start.current
      const wasHorizontal = axis.current === 'h' && !excluded.current
      start.current = null
      axis.current = null
      if (!s || !wasHorizontal) return
      const t = e.changedTouches[0]
      const dx = t.clientX - s.x
      if (Math.abs(dx) < SWIPE_MIN) return
      const next = dx < 0 ? idx + 1 : idx - 1 // swiped left -> next page, right -> previous
      if (next < 0 || next >= PAGES.length) return
      nav.dir = next > idx ? 1 : -1
      router.push(PAGES[next].href)
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [pathname, router])

  return null
}

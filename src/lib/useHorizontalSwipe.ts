'use client'

import { useEffect, useRef } from 'react'

const LOCK_AT = 8       // px before the gesture's axis is decided at all
const LOCK_RATIO = 1.3  // how much more horizontal than vertical to call it a swipe, not a scroll

// Any ancestor that scrolls sideways gets first claim on a horizontal drag — a chip
// row, a tab strip, any horizontally-scrolling carousel. Detected generically
// (computed overflow-x + actual overflow) rather than by class name, so a new scroll
// strip never has to remember to opt out of this.
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

// Fires onSwipe(1 | -1) once a touch gesture commits past `minPx` of horizontal
// travel, having angle-locked to horizontal early in the gesture (1 = swiped left,
// i.e. "next"; -1 = swiped right, i.e. "previous").
//
// Purely passive — never calls preventDefault, so it can never fight a real scroll;
// it only ever reacts, after the fact, to a gesture that already looked horizontal.
// Skips entirely inside any element matching `excludeSelector`, inside anything that
// itself scrolls sideways, or while a modal/sheet (.modal-backdrop) is open.
export function useHorizontalSwipe(
  onSwipe: (dir: 1 | -1) => void,
  opts: { enabled?: boolean; minPx?: number; excludeSelector?: string } = {}
) {
  const { enabled = true, minPx = 60, excludeSelector } = opts
  const start = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<'h' | 'v' | null>(null)
  const excluded = useRef(false)
  // Ref so a swipe caught mid-gesture always calls the LATEST callback/closure
  // without needing it in the effect's own dependency array.
  const onSwipeRef = useRef(onSwipe)
  onSwipeRef.current = onSwipe

  useEffect(() => {
    if (!enabled) return

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || document.querySelector('.modal-backdrop')) { start.current = null; return }
      const target = e.target as Element
      if (excludeSelector && target.closest?.(excludeSelector)) { start.current = null; excluded.current = true; return }
      const t = e.touches[0]
      start.current = { x: t.clientX, y: t.clientY }
      axis.current = null
      excluded.current = insideHorizontalScroller(target)
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
      if (Math.abs(dx) < minPx) return
      onSwipeRef.current(dx < 0 ? 1 : -1)
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [enabled, minPx, excludeSelector])
}

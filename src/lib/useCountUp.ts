'use client'

import { useEffect, useRef, useState } from 'react'

// Animates a headline number from its previous value to a new one instead of
// snapping — the difference between "a spreadsheet in a browser" and a real fintech
// app. Skips the very first render (shows the real value immediately, nothing
// animates in from zero on load) and respects prefers-reduced-motion.
export function useCountUp(value: number, duration = 550): number {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  const first = useRef(true)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (first.current) { first.current = false; prev.current = value; setDisplay(value); return }
    const from = prev.current
    const to = value
    prev.current = value
    if (from === to) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(to)
      return
    }
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic — fast start, gentle settle
      setDisplay(from + (to - from) * eased)
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else raf.current = null
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current) }
  }, [value, duration])

  return display
}

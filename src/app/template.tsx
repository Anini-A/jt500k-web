'use client'

import { useRef } from 'react'
import { nav } from '@/lib/nav'

// Re-mounts on every navigation (Next App Router) — we use it to slide the new
// page in from the side matching the swipe/tap direction.
export default function Template({ children }: { children: React.ReactNode }) {
  const dir = useRef(nav.dir).current
  nav.dir = 0
  const cls = dir > 0 ? 'pt-right' : dir < 0 ? 'pt-left' : 'pt-fade'
  return <div className={`page-transition ${cls}`}>{children}</div>
}

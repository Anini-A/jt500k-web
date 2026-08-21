'use client'

import { ReactNode, useRef } from 'react'

interface Props {
  icon: ReactNode
  label: string
  href?: string
  onClick?: () => void
  onLongPress?: () => void
  accent?: boolean
  external?: boolean
}

// Fixed circular glass icon button. The label is hidden (see globals.css) and
// surfaced as a native tooltip via title + aria-label — clean on web and mobile.
export default function IconPill({ icon, label, href, onClick, onLongPress, accent, external }: Props) {
  const className = `icon-pill${accent ? ' accent' : ''}`
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const lp = onLongPress
    ? {
        onTouchStart: () => { fired.current = false; timer.current = setTimeout(() => { fired.current = true; onLongPress() }, 450) },
        onTouchEnd: () => { if (timer.current) clearTimeout(timer.current) },
        onTouchMove: () => { if (timer.current) clearTimeout(timer.current) },
        onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); onLongPress() },
      }
    : {}
  const inner = (
    <>
      {icon}
      <span className="label">{label}</span>
    </>
  )
  if (href) {
    return (
      <a className={className} href={href} aria-label={label} title={label}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {inner}
      </a>
    )
  }
  return <button className={className} onClick={() => { if (fired.current) { fired.current = false; return } onClick?.() }} aria-label={label} title={label} {...lp}>{inner}</button>
}

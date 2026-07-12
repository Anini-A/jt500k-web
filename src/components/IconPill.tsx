'use client'

import { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  label: string
  href?: string
  onClick?: () => void
  accent?: boolean
  external?: boolean
}

// Fixed circular glass icon button. The label is hidden (see globals.css) and
// surfaced as a native tooltip via title + aria-label — clean on web and mobile.
export default function IconPill({ icon, label, href, onClick, accent, external }: Props) {
  const className = `icon-pill${accent ? ' accent' : ''}`
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
  return <button className={className} onClick={onClick} aria-label={label} title={label}>{inner}</button>
}

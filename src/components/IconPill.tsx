'use client'

import { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  label: string
  href?: string
  onClick?: () => void
  accent?: boolean
}

// Circular glass button that expands to show its label on hover.
export default function IconPill({ icon, label, href, onClick, accent }: Props) {
  const className = `icon-pill${accent ? ' accent' : ''}`
  const inner = (
    <>
      {icon}
      <span className="label">{label}</span>
    </>
  )
  if (href) {
    return <a className={className} href={href} aria-label={label} title={label}>{inner}</a>
  }
  return <button className={className} onClick={onClick} aria-label={label} title={label}>{inner}</button>
}

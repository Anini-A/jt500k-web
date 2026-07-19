import type { LucideIcon } from 'lucide-react'

// Consistent card/section heading: a lucide icon + text, matching the dashboard tabs.
// Replaces the old emoji-prefixed titles across the app.
export default function SectionTitle({ icon: Icon, size = 18, children, style, iconColor = 'var(--text-secondary)' }: {
  icon: LucideIcon
  size?: number
  children: React.ReactNode
  style?: React.CSSProperties
  iconColor?: string
}) {
  return (
    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, ...style }}>
      <Icon size={size} strokeWidth={2} style={{ color: iconColor, flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </h2>
  )
}

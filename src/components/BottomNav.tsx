'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Home, Receipt, LayoutDashboard } from 'lucide-react'
import { nav } from '@/lib/nav'

// Native-style bottom tab bar — mobile only (hidden on desktop, where the header pill is used).
const ITEMS = [
  { key: 'transactions', label: 'Transactions', href: '/transactions', Icon: Receipt },
  { key: 'home', label: 'Home', href: '/', Icon: Home },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', Icon: LayoutDashboard },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const current = pathname === '/' ? 'home' : pathname.startsWith('/transactions') ? 'transactions' : pathname.startsWith('/dashboard') ? 'dashboard' : ''
  const idx = ITEMS.findIndex((i) => i.key === current)

  const go = (i: number) => {
    if (i === idx || i < 0) return
    nav.dir = i > idx ? 1 : -1 // keep the same left→right slide direction as the header pill
    router.push(ITEMS[i].href)
  }

  return (
    <nav className="bottom-nav" aria-label="Sections">
      {ITEMS.map((it, i) => {
        const Icon = it.Icon
        const active = i === idx
        return (
          <button key={it.key} onClick={() => go(i)} className={active ? 'active' : ''} aria-current={active}>
            <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            <span>{it.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

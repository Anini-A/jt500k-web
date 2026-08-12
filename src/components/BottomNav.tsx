'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Receipt, LayoutDashboard, Sparkles } from 'lucide-react'
import { nav } from '@/lib/nav'
import ChatWidget from './ChatWidget'

// Floating, glass bottom bar — mobile only. Section switching + the AI chat.
const ITEMS = [
  { key: 'home', label: 'Home', href: '/', Icon: Home },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', Icon: LayoutDashboard },
  { key: 'transactions', label: 'Transactions', href: '/transactions', Icon: Receipt },
]
// slide direction follows the actual page order (Transactions ← Home → Dashboard), not the bar order
const PAGE_POS: Record<string, number> = { transactions: 0, home: 1, dashboard: 2 }

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [chatOpen, setChatOpen] = useState(false)
  const current = pathname === '/' ? 'home' : pathname.startsWith('/transactions') ? 'transactions' : pathname.startsWith('/dashboard') ? 'dashboard' : ''

  const go = (key: string, href: string) => {
    if (key === current) return
    nav.dir = (PAGE_POS[key] ?? 0) > (PAGE_POS[current] ?? 0) ? 1 : -1
    router.push(href)
  }

  return (
    <>
      <nav className="bottom-nav" aria-label="Sections">
        {ITEMS.map((it) => {
          const Icon = it.Icon
          const active = it.key === current
          return (
            <button key={it.key} onClick={() => go(it.key, it.href)} className={active ? 'active' : ''} aria-label={it.label} aria-current={active}>
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            </button>
          )
        })}
        <button onClick={() => setChatOpen(true)} aria-label="Ask AI" title="Ask AI"><Sparkles size={22} /></button>
      </nav>
      {chatOpen && <ChatWidget onClose={() => setChatOpen(false)} />}
    </>
  )
}

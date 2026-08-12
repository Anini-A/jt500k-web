'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Receipt, LayoutDashboard, Sparkles } from 'lucide-react'
import { nav } from '@/lib/nav'
import ChatWidget from './ChatWidget'

// Floating, glass bottom bar — mobile only. Section switching + the AI chat.
const ITEMS = [
  { key: 'transactions', label: 'Transactions', href: '/transactions', Icon: Receipt },
  { key: 'home', label: 'Home', href: '/', Icon: Home },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', Icon: LayoutDashboard },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [chatOpen, setChatOpen] = useState(false)
  const current = pathname === '/' ? 'home' : pathname.startsWith('/transactions') ? 'transactions' : pathname.startsWith('/dashboard') ? 'dashboard' : ''
  const idx = ITEMS.findIndex((i) => i.key === current)

  const go = (i: number) => {
    if (i === idx || i < 0) return
    nav.dir = i > idx ? 1 : -1 // keep the same left→right slide direction as the header pill
    router.push(ITEMS[i].href)
  }

  return (
    <>
      <nav className="bottom-nav" aria-label="Sections">
        {ITEMS.map((it, i) => {
          const Icon = it.Icon
          const active = i === idx
          return (
            <button key={it.key} onClick={() => go(i)} className={active ? 'active' : ''} aria-label={it.label} aria-current={active}>
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

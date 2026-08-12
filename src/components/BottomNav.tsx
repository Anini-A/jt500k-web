'use client'

import { useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Receipt, LayoutDashboard, Sparkles, Target, Wallet, CreditCard, PiggyBank, Banknote, LineChart, Users, type LucideIcon } from 'lucide-react'
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

// dashboard sub-tabs — long-press the Dashboard icon to jump straight to one
const DASH_TABS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'budget', label: 'Budget', Icon: Target },
  { key: 'bills', label: 'Bills', Icon: Receipt },
  { key: 'income', label: 'Income', Icon: Wallet },
  { key: 'expenses', label: 'Expenses', Icon: CreditCard },
  { key: 'savings', label: 'Savings', Icon: PiggyBank },
  { key: 'debts', label: 'Debts', Icon: Banknote },
  { key: 'investments', label: 'Investments', Icon: LineChart },
  { key: 'household', label: 'Household', Icon: Users },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [chatOpen, setChatOpen] = useState(false)
  const [dashMenu, setDashMenu] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const current = pathname === '/' ? 'home' : pathname.startsWith('/transactions') ? 'transactions' : pathname.startsWith('/dashboard') ? 'dashboard' : ''

  const go = (key: string, href: string) => {
    if (key === current) return
    nav.dir = (PAGE_POS[key] ?? 0) > (PAGE_POS[current] ?? 0) ? 1 : -1
    router.push(href)
  }

  // long-press on Dashboard → open the tab menu
  const startPress = () => { longPressed.current = false; pressTimer.current = setTimeout(() => { longPressed.current = true; setDashMenu(true) }, 420) }
  const cancelPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current) }

  const pickTab = (key: string) => {
    setDashMenu(false)
    try { localStorage.setItem('jt-dash-tab', key) } catch { /* ignore */ }
    if (pathname.startsWith('/dashboard')) window.dispatchEvent(new CustomEvent('dash-tab', { detail: key }))
    else { nav.dir = (PAGE_POS.dashboard) > (PAGE_POS[current] ?? 0) ? 1 : -1; router.push('/dashboard') }
  }

  return (
    <>
      {dashMenu && (
        <>
          <div onClick={() => setDashMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 95 }} />
          <div className="dash-menu">
            {DASH_TABS.map((t) => {
              const Icon = t.Icon
              return (
                <button key={t.key} onClick={() => pickTab(t.key)}>
                  <Icon size={17} /> {t.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      <nav className="bottom-nav" aria-label="Sections">
        {ITEMS.map((it) => {
          const Icon = it.Icon
          const active = it.key === current
          const isDash = it.key === 'dashboard'
          return (
            <button key={it.key}
              onClick={() => { if (longPressed.current) { longPressed.current = false; return } go(it.key, it.href) }}
              onTouchStart={isDash ? startPress : undefined} onTouchEnd={isDash ? cancelPress : undefined} onTouchMove={isDash ? cancelPress : undefined}
              onMouseDown={isDash ? startPress : undefined} onMouseUp={isDash ? cancelPress : undefined} onMouseLeave={isDash ? cancelPress : undefined}
              onContextMenu={isDash ? (e) => { e.preventDefault(); setDashMenu(true) } : undefined}
              className={active ? 'active' : ''} aria-label={it.label} aria-current={active}>
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

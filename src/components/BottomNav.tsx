'use client'

import { useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Receipt, LayoutDashboard, Sparkles, Target, Wallet, CreditCard, PiggyBank, Banknote, LineChart, Users, type LucideIcon } from 'lucide-react'
import { nav } from '@/lib/nav'
import { getJSON } from '@/lib/fresh'
import ChatWidget from './ChatWidget'

// Floating, glass bottom bar — mobile only. Section switching + the AI chat.
const ITEMS = [
  { key: 'home', label: 'Home', href: '/', Icon: Home },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', Icon: LayoutDashboard },
  { key: 'transactions', label: 'Transactions', href: '/transactions', Icon: Receipt },
]
// left → right page order (Home · Dashboard · Transactions) — drives the slide direction
const PAGE_POS: Record<string, number> = { home: 0, dashboard: 1, transactions: 2 }

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

  // Start the page's data on touch-down. By the time the route renders the response is
  // usually in flight or already cached, so the new page paints with numbers rather than
  // arriving empty and filling in.
  const warm = (key: string) => {
    if (key === current) return
    getJSON('/api/data').catch(() => {})
    if (key === 'dashboard') { getJSON('/api/budgets').catch(() => {}); getJSON('/api/debts').catch(() => {}) }
  }

  const go = (key: string, href: string) => {
    if (key === current) return
    nav.dir = (PAGE_POS[key] ?? 0) > (PAGE_POS[current] ?? 0) ? 1 : -1
    router.push(href)
  }

  // long-press actions: Dashboard → tab menu, Transactions → add-transaction shortcut
  const startPress = (action: () => void) => { longPressed.current = false; pressTimer.current = setTimeout(() => { longPressed.current = true; action() }, 420) }
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
        <div className="nav-pill">
        {ITEMS.map((it) => {
          const Icon = it.Icon
          const active = it.key === current
          const longAction = it.key === 'dashboard' ? () => setDashMenu(true)
            : it.key === 'transactions' ? () => window.dispatchEvent(new CustomEvent('open-add-transaction'))
              : undefined
          return (
            <button key={it.key}
              onClick={() => { if (longPressed.current) { longPressed.current = false; return } go(it.key, it.href) }}
              onTouchStart={() => { warm(it.key); if (longAction) startPress(longAction) }} onTouchEnd={longAction ? cancelPress : undefined} onTouchMove={longAction ? cancelPress : undefined}
              onMouseDown={() => { warm(it.key); if (longAction) startPress(longAction) }} onMouseUp={longAction ? cancelPress : undefined} onMouseLeave={longAction ? cancelPress : undefined}
              onContextMenu={longAction ? (e) => { e.preventDefault(); longAction() } : undefined}
              className={active ? 'active' : ''} aria-label={it.label} aria-current={active}>
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            </button>
          )
        })}
        </div>
        {/* the AI chat sits outside the pill as its own button — it opens a sheet rather
            than switching section, so it isn't one of the nav destinations */}
        <button className="nav-fab" aria-label="Ask AI" title="Ask AI" onClick={() => setChatOpen(true)}>
          <Sparkles size={22} />
        </button>
      </nav>
      {chatOpen && <ChatWidget onClose={() => setChatOpen(false)} />}
    </>
  )
}

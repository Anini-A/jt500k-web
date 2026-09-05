'use client'

import { useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Receipt, LayoutDashboard, Sparkles, Target, Wallet, CreditCard, PiggyBank, Banknote, LineChart, Users, TriangleAlert, Plus, type LucideIcon } from 'lucide-react'
import { nav } from '@/lib/nav'
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

// Long-press the AI button for the questions worth not retyping. Verbs, not topics —
// each one either answers on the spot or starts the entry it names.
const AI_ACTIONS: { label: string; Icon: LucideIcon; prompt?: string; open?: 'add' }[] = [
  { label: 'What can I afford?', Icon: Wallet, prompt: 'What can I afford to spend right now? Use this month\u2019s unspent figure and subtract the bills still due.' },
  { label: 'How am I doing?', Icon: Target, prompt: 'How am I doing this month against my budget? Compare spending to where I should be at this point in the month, and name anything running hot.' },
  // Not a chat prompt: logging is a form, and asking the model to interview you for the
  // amount and category is slower than the sheet that already does it.
  { label: 'Log a payment', Icon: Plus, open: 'add' },
  { label: 'Any surprises?', Icon: TriangleAlert, prompt: 'Any surprises in my spending recently? Look for unusual charges, categories tracking above their normal level, and bills that changed amount.' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [chatOpen, setChatOpen] = useState(false)
  const [chatSeed, setChatSeed] = useState<{ prompt?: string; input?: string }>({})
  const [dashMenu, setDashMenu] = useState(false)
  const [aiMenu, setAiMenu] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const current = pathname === '/' ? 'home' : pathname.startsWith('/transactions') ? 'transactions' : pathname.startsWith('/dashboard') ? 'dashboard' : ''

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

      {aiMenu && (
        <>
          <div onClick={() => setAiMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 95 }} />
          <div className="dash-menu">
            {AI_ACTIONS.map((a) => {
              const Icon = a.Icon
              return (
                <button key={a.label} onClick={() => {
                  setAiMenu(false)
                  if (a.open === 'add') { window.dispatchEvent(new CustomEvent('open-add-transaction')); return }
                  setChatSeed({ prompt: a.prompt }); setChatOpen(true)
                }}>
                  <Icon size={17} /> {a.label}
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
              onTouchStart={longAction ? () => startPress(longAction) : undefined} onTouchEnd={longAction ? cancelPress : undefined} onTouchMove={longAction ? cancelPress : undefined}
              onMouseDown={longAction ? () => startPress(longAction) : undefined} onMouseUp={longAction ? cancelPress : undefined} onMouseLeave={longAction ? cancelPress : undefined}
              onContextMenu={longAction ? (e) => { e.preventDefault(); longAction() } : undefined}
              className={active ? 'active' : ''} aria-label={it.label} aria-current={active}>
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            </button>
          )
        })}
        </div>
        {/* the AI chat sits outside the pill as its own button — it opens a sheet rather
            than switching section, so it isn't one of the nav destinations */}
        <button className="nav-fab" aria-label="Ask AI" title="Ask AI — hold for quick actions"
          onClick={() => { if (longPressed.current) { longPressed.current = false; return } setChatSeed({}); setChatOpen(true) }}
          onTouchStart={() => startPress(() => setAiMenu(true))} onTouchEnd={cancelPress} onTouchMove={cancelPress}
          onMouseDown={() => startPress(() => setAiMenu(true))} onMouseUp={cancelPress} onMouseLeave={cancelPress}
          onContextMenu={(e) => { e.preventDefault(); setAiMenu(true) }}>
          <Sparkles size={22} />
        </button>
      </nav>
      {chatOpen && <ChatWidget onClose={() => setChatOpen(false)} initialPrompt={chatSeed.prompt} initialInput={chatSeed.input} />}
    </>
  )
}

'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Home, Receipt, LayoutDashboard, Settings, RefreshCw, Landmark, MessageCircle } from 'lucide-react'
import IconPill from './IconPill'
import AddTransactionButton from './AddTransactionButton'
import SettingsPanel from './SettingsPanel'
import ChatWidget from './ChatWidget'
import NotificationBell from './NotificationBell'

type Page = 'home' | 'dashboard' | 'transactions' | 'settings'

// Consistent header nav across pages. Order: Home · Add · All Transactions ·
// Dashboard · Settings · Refresh. The current page's own link is omitted.
export default function HeaderNav({ current }: { current: Page }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {current !== 'home' && <IconPill icon={<Home />} label="Home" href="/" />}
      <AddTransactionButton />
      {current !== 'dashboard' && <IconPill icon={<LayoutDashboard />} label="Dashboard" href="/dashboard" />}
      {current !== 'transactions' && <IconPill icon={<Receipt />} label="All Transactions" href="/transactions" />}
      <IconPill icon={<Landmark />} label="Wealthsimple" href="https://my.wealthsimple.com/app/login" external />
      {current !== 'settings' && (
        <IconPill icon={<Settings />} label="Settings" onClick={() => setSettingsOpen(true)} />
      )}
      <IconPill icon={<RefreshCw />} label="Refresh" onClick={() => window.location.reload()} />
      <NotificationBell />
      <IconPill icon={<MessageCircle />} label="Ask AI" onClick={() => setChatOpen(true)} />

      {chatOpen && <ChatWidget onClose={() => setChatOpen(false)} />}

      {settingsOpen && createPortal(
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal-card glass" style={{ width: 'min(760px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>⚙️ Settings</h2>
              <button className="modal-x" aria-label="Close" onClick={() => setSettingsOpen(false)}>✕</button>
            </div>
            <SettingsPanel />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

'use client'

'use client'

import { Home, Receipt, LayoutDashboard, Settings, RefreshCw } from 'lucide-react'
import IconPill from './IconPill'
import AddTransactionButton from './AddTransactionButton'

type Page = 'home' | 'dashboard' | 'transactions' | 'settings'

// Consistent header nav across pages. Order: Home · Add · All Transactions ·
// Dashboard · Settings · Refresh. The current page's own link is omitted.
export default function HeaderNav({ current }: { current: Page }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {current !== 'home' && <IconPill icon={<Home />} label="Home" href="/" />}
      <AddTransactionButton />
      {current !== 'transactions' && <IconPill icon={<Receipt />} label="All Transactions" href="/transactions" />}
      {current !== 'dashboard' && <IconPill icon={<LayoutDashboard />} label="Dashboard" href="/dashboard" />}
      {current !== 'settings' && <IconPill icon={<Settings />} label="Settings" href="/settings" />}
      <IconPill icon={<RefreshCw />} label="Refresh" onClick={() => window.location.reload()} />
    </div>
  )
}

'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Settings } from 'lucide-react'
import IconPill from './IconPill'
import SettingsPanel from './SettingsPanel'

type Page = 'home' | 'dashboard' | 'transactions' | 'settings'

// Header actions (page navigation now lives in the centered PagePill). Just the
// two things you reach for: Add a transaction, and Settings.
export default function HeaderNav({ current }: { current: Page }) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {current !== 'settings' && (
        <IconPill icon={<Settings />} label="Settings" onClick={() => setSettingsOpen(true)} />
      )}

      {settingsOpen && createPortal(
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal-card glass" style={{ width: 'min(760px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={18} /> Settings</h2>
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

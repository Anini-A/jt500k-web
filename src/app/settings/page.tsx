'use client'

import HeaderNav from '@/components/HeaderNav'
import NotificationBell from '@/components/NotificationCenter'
import SettingsPanel from '@/components/SettingsPanel'

export default function SettingsPage() {
  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NotificationBell />
            <span className="brand"><span>Settings</span></span>
          </div>
          <div />
          <HeaderNav current="settings" />
        </header>

        <SettingsPanel />
      </div>
    </div>
  )
}

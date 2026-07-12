'use client'

import HeaderNav from '@/components/HeaderNav'
import SettingsPanel from '@/components/SettingsPanel'

export default function SettingsPage() {
  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <span>Settings</span>
          </div>
          <HeaderNav current="settings" />
        </header>

        <SettingsPanel />
      </div>
    </div>
  )
}

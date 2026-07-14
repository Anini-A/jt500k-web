'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Bell } from 'lucide-react'
import { getJSON } from '@/lib/fresh'

interface Notif { id: string; icon: string; title: string; detail: string; severity: 'info' | 'warn' }
const SEEN_KEY = 'jt-notifs-seen'

const readSeen = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

export default function NotificationBell() {
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState<string[]>([])

  const load = useCallback(() => {
    getJSON('/api/notifications').then((d) => { if (Array.isArray(d.notifications)) setNotifs(d.notifications) }).catch(() => {})
  }, [])

  useEffect(() => {
    setSeen(readSeen())
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const unseen = notifs.filter((n) => !seen.includes(n.id)).length

  const openPanel = () => {
    setOpen(true)
    // mark everything currently shown as seen
    const ids = notifs.map((n) => n.id)
    const merged = Array.from(new Set([...readSeen(), ...ids])).slice(-100)
    localStorage.setItem(SEEN_KEY, JSON.stringify(merged))
    setSeen(merged)
  }

  return (
    <>
      <button className="icon-pill" aria-label="Notifications" title="Notifications" onClick={openPanel} style={{ position: 'relative' }}>
        <Bell />
        {unseen > 0 && (
          <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--expense)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </button>

      {open && createPortal(
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-card glass" style={{ width: 'min(460px, 100%)', background: 'var(--surface-1)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>🔔 Notifications</h2>
              <button className="modal-x" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
            </div>

            {notifs.length === 0 ? (
              <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>🎉 You&apos;re all caught up — nothing needs attention.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {notifs.map((n) => (
                  <div key={n.id} style={{ display: 'flex', gap: 11, padding: '11px 12px', borderRadius: 12, background: 'var(--kpi-bg)', border: `1px solid ${n.severity === 'warn' ? 'var(--expense)' : 'var(--border)'}` }}>
                    <span style={{ fontSize: 18, lineHeight: 1.2, flexShrink: 0 }}>{n.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</div>
                      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>{n.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON } from '@/lib/fresh'

interface Notif { id: string; icon: string; title: string; detail: string; severity: 'info' | 'warn' }

// Urgent + notable action items, pulled from the same engine as the 🔔 bell.
// Warnings (bill top-up, over budget) float to the top; sits next to Current Balance.
export default function ActionItemsCard() {
  const [items, setItems] = useState<Notif[] | null>(null)

  const load = useCallback(() => {
    getJSON('/api/notifications').then((d) => { if (!d.error) setItems(d.notifications || []) }).catch(() => setItems([]))
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const warns = (items || []).filter((n) => n.severity === 'warn')
  const infos = (items || []).filter((n) => n.severity === 'info')
  const ordered = [...warns, ...infos]
  const shown = ordered.slice(0, 4)
  const extra = ordered.length - shown.length

  return (
    <div className="card glass" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0 }}>⚡ Action Items</h2>
        {warns.length > 0 && (
          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--expense)', background: 'var(--expense-soft)', padding: '3px 9px', borderRadius: 999 }}>
            {warns.length} urgent
          </span>
        )}
      </div>

      <div style={{ marginTop: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items === null ? (
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Checking…</div>
        ) : ordered.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)', gap: 6, padding: '10px 0' }}>
            <div style={{ fontSize: 28 }}>✅</div>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>All clear</div>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Nothing needs your attention right now.</div>
          </div>
        ) : (
          <>
            {shown.map((n) => {
              const urgent = n.severity === 'warn'
              return (
                <div key={n.id} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 11px', borderRadius: 12,
                  background: urgent ? 'var(--expense-soft)' : 'var(--kpi-bg)',
                  border: '1px solid var(--border)', borderLeft: `3px solid ${urgent ? 'var(--expense)' : 'var(--accent)'}`,
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1.2, flexShrink: 0 }}>{n.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</div>
                    <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2, overflowWrap: 'anywhere' }}>{n.detail}</div>
                  </div>
                </div>
              )
            })}
            {extra > 0 && (
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, textAlign: 'center', marginTop: 2 }}>
                +{extra} more in the 🔔 bell
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

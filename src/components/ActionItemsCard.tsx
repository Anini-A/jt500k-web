'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON } from '@/lib/fresh'

interface Notif { id: string; icon: string; title: string; detail: string; severity: 'info' | 'warn'; kind: 'action' | 'info'; dismissible: boolean }

// The app's single action center (replaces the notification bell).
// NEEDS ACTION (kind 'action') persists until the condition clears and auto-vanishes
//   when you handle it — not dismissible (except recurring, which allows "skip this month").
// GOOD TO KNOW (kind 'info') is purely informational — dismissible + "Clear all".
// Dismissals are stored server-side (DB), so they sync across devices.
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

  const shown = items || []
  // Needs action: urgent (warn) first, then the rest
  const actions = shown.filter((n) => n.kind === 'action').sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1))
  const infos = shown.filter((n) => n.kind === 'info')
  const urgentCount = actions.filter((n) => n.severity === 'warn').length

  const dismissIds = async (ids: string[]) => {
    if (!ids.length) return
    setItems((cur) => (cur || []).filter((n) => !ids.includes(n.id))) // optimistic
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => {})
    load()
  }
  const dismiss = (id: string) => dismissIds([id])
  // Clear all only touches "Good to know" — it can never hide a real to-do
  const clearInfo = () => dismissIds(infos.map((n) => n.id))

  return (
    <div className="card glass" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0 }}>🔔 Alerts</h2>
        {urgentCount > 0 && (
          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--expense)', background: 'var(--expense-soft)', padding: '3px 9px', borderRadius: 999, flexShrink: 0 }}>{urgentCount} urgent</span>
        )}
      </div>

      <div style={{ marginTop: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 460, overflowY: 'auto' }}>
        {items === null ? (
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Checking…</div>
        ) : actions.length === 0 && infos.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)', gap: 6, padding: '10px 0' }}>
            <div style={{ fontSize: 28 }}>✅</div>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>All clear</div>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Nothing needs your attention right now.</div>
          </div>
        ) : (
          <>
            {actions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--expense)' }}>Needs action</div>
                {actions.map((n) => <Item key={n.id} n={n} onDismiss={n.dismissible ? () => dismiss(n.id) : undefined} skip={n.dismissible} />)}
              </div>
            )}
            {infos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Good to know</div>
                  <button onClick={clearInfo} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Clear all</button>
                </div>
                {infos.map((n) => <Item key={n.id} n={n} onDismiss={() => dismiss(n.id)} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Item({ n, onDismiss, skip }: { n: Notif; onDismiss?: () => void; skip?: boolean }) {
  const urgent = n.severity === 'warn'
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 11px', borderRadius: 12,
      background: urgent ? 'var(--expense-soft)' : 'var(--kpi-bg)',
      border: '1px solid var(--border)', borderLeft: `3px solid ${urgent ? 'var(--expense)' : 'var(--accent)'}`,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1.2, flexShrink: 0 }}>{n.icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</div>
        <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2, overflowWrap: 'anywhere' }}>{n.detail}</div>
      </div>
      {onDismiss ? (
        skip ? (
          <button onClick={onDismiss} title="Skip this month" style={{ flexShrink: 0, alignSelf: 'flex-start', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>Skip</button>
        ) : (
          <button onClick={onDismiss} aria-label="Dismiss" title="Dismiss" style={{ flexShrink: 0, alignSelf: 'flex-start', width: 24, height: 24, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
        )
      ) : null}
    </div>
  )
}

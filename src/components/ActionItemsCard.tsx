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
        {(() => {
          const total = actions.length + infos.length
          if (!total) return null
          const hot = urgentCount > 0
          return (
            <span title={hot ? `${urgentCount} urgent of ${total}` : `${total} active`}
              style={{ fontWeight: 700, fontSize: 12, lineHeight: '20px', minWidth: 20, textAlign: 'center', padding: '0 7px', borderRadius: 999, flexShrink: 0, background: hot ? 'var(--expense-soft)' : 'var(--kpi-bg)', color: hot ? 'var(--expense)' : 'var(--text-secondary)' }}>{total}</span>
          )
        })()}
      </div>

      {/* Scroll region is absolutely positioned so its content never grows the card —
          Current Balance sets the row height and a long alert list scrolls inside. */}
      <div style={{ position: 'relative', flex: 1, minHeight: 220, marginTop: 14 }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 22, overflowY: 'auto' }}>
        {items === null ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Checking…</div>
        ) : actions.length === 0 && infos.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)', gap: 6, padding: '10px 0' }}>
            <div style={{ fontSize: 26 }}>✅</div>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>All clear</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing needs your attention right now.</div>
          </div>
        ) : (
          <>
            {actions.length > 0 && (
              <div>
                <SectionLabel>Needs action</SectionLabel>
                {actions.map((n, i) => <Item key={n.id} n={n} first={i === 0} onDismiss={n.dismissible ? () => dismiss(n.id) : undefined} skip={n.dismissible} />)}
              </div>
            )}
            {infos.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <SectionLabel>Good to know</SectionLabel>
                  <button onClick={clearInfo} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: 0, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear all</button>
                </div>
                {infos.map((n, i) => <Item key={n.id} n={n} first={i === 0} onDismiss={() => dismiss(n.id)} />)}
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{children}</div>
}

function Item({ n, first, onDismiss, skip }: { n: Notif; first?: boolean; onDismiss?: () => void; skip?: boolean }) {
  const urgent = n.severity === 'warn'
  const dot = urgent ? 'var(--expense)' : n.kind === 'action' ? 'var(--accent)' : 'var(--text-muted)'
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '12px 0', borderTop: first ? 'none' : '1px solid var(--border)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 6 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, overflowWrap: 'anywhere' }}>{n.detail}</div>
      </div>
      {onDismiss ? (
        skip ? (
          <button onClick={onDismiss} title="Skip this month" style={{ flexShrink: 0, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0, whiteSpace: 'nowrap' }}>Skip</button>
        ) : (
          <button onClick={onDismiss} aria-label="Dismiss" title="Dismiss" style={{ flexShrink: 0, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
        )
      ) : null}
    </div>
  )
}

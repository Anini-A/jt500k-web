'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON } from '@/lib/fresh'

interface Notif { id: string; icon: string; title: string; detail: string; severity: 'info' | 'warn' }
const DISMISSED_KEY = 'jt-notifs-dismissed'
const readArr = (): string[] => { try { const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }

// The app's single action center (replaces the notification bell).
// URGENT  = severity 'warn'  → money at risk / time-sensitive (bill top-up, over budget).
// FOR LATER = severity 'info' → good to do, not time-critical (recurring to log, trends, household to-dos).
export default function ActionItemsCard() {
  const [items, setItems] = useState<Notif[] | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])

  const load = useCallback(() => {
    getJSON('/api/notifications').then((d) => { if (!d.error) setItems(d.notifications || []) }).catch(() => setItems([]))
  }, [])
  useEffect(() => {
    setDismissed(readArr())
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const shown = (items || []).filter((n) => !dismissed.includes(n.id))
  const urgent = shown.filter((n) => n.severity === 'warn')
  const later = shown.filter((n) => n.severity === 'info')

  const dismiss = (id: string) => {
    const next = Array.from(new Set([...readArr(), id])).slice(-300)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); setDismissed(next)
  }
  const clearAll = () => {
    const next = Array.from(new Set([...readArr(), ...shown.map((n) => n.id)])).slice(-300)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); setDismissed(next)
  }

  return (
    <div className="card glass" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0 }}>⚡ Action Items</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {urgent.length > 0 && (
            <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--expense)', background: 'var(--expense-soft)', padding: '3px 9px', borderRadius: 999 }}>{urgent.length} urgent</span>
          )}
          {shown.length > 0 && (
            <button onClick={clearAll} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear all</button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 360, overflowY: 'auto' }}>
        {items === null ? (
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Checking…</div>
        ) : shown.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)', gap: 6, padding: '10px 0' }}>
            <div style={{ fontSize: 28 }}>✅</div>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>All clear</div>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Nothing needs your attention right now.</div>
          </div>
        ) : (
          <>
            {urgent.length > 0 && (
              <Section label="Urgent" color="var(--expense)">
                {urgent.map((n) => <Item key={n.id} n={n} urgent onDismiss={() => dismiss(n.id)} />)}
              </Section>
            )}
            {later.length > 0 && (
              <Section label="For later" color="var(--text-muted)">
                {later.map((n) => <Item key={n.id} n={n} onDismiss={() => dismiss(n.id)} />)}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color }}>{label}</div>
      {children}
    </div>
  )
}

function Item({ n, urgent, onDismiss }: { n: Notif; urgent?: boolean; onDismiss: () => void }) {
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
      <button aria-label="Dismiss" title="Dismiss" onClick={onDismiss}
        style={{ flexShrink: 0, alignSelf: 'flex-start', width: 24, height: 24, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
    </div>
  )
}

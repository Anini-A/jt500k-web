'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Bell, CheckCircle2 } from 'lucide-react'
import { getJSON } from '@/lib/fresh'

interface Notif { id: string; icon: string; title: string; detail: string; severity: 'info' | 'warn'; kind: 'action' | 'info'; dismissible: boolean }

// Top-left bell + a dedicated notification center panel. Replaces the on-Home
// alerts card: alerts now live in one organized place reachable from every page.
export default function NotificationBell() {
  const [items, setItems] = useState<Notif[] | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    getJSON('/api/notifications').then((d) => { if (!d.error) setItems(d.notifications || []) }).catch(() => setItems([]))
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    window.addEventListener('drafts-changed', load)
    return () => { window.removeEventListener('transaction-added', load); window.removeEventListener('drafts-changed', load) }
  }, [load])

  const shown = items || []
  const actions = shown.filter((n) => n.kind === 'action').sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1))
  const infos = shown.filter((n) => n.kind === 'info')
  const total = actions.length + infos.length
  const urgent = actions.some((n) => n.severity === 'warn')

  const dismissIds = async (ids: string[]) => {
    if (!ids.length) return
    setItems((cur) => (cur || []).filter((n) => !ids.includes(n.id)))
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => {})
    load()
  }
  const dismiss = (id: string) => dismissIds([id])
  const clearInfo = () => dismissIds(infos.map((n) => n.id))

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={total ? `${total} alerts` : 'Alerts'} title="Alerts"
        style={{ position: 'relative', width: 40, height: 40, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-secondary)', cursor: 'pointer', WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)' }}>
        <Bell size={18} />
        {total > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, lineHeight: '17px', textAlign: 'center', color: '#fff', background: urgent ? 'var(--expense)' : 'var(--accent)', border: '2px solid var(--page-plane)' }}>{total}</span>
        )}
      </button>

      {open && createPortal(
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-card glass" style={{ width: 'min(560px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><Bell size={18} /> Alerts{total ? <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>· {total}</span> : null}</h2>
              <button className="modal-x" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
            </div>

            {items === null ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '20px 0' }}>Checking…</div>
            ) : total === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, padding: '32px 0', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={30} color="var(--income)" />
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>All clear</div>
                <div style={{ fontSize: 13 }}>Nothing needs your attention right now.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxHeight: '68vh', overflowY: 'auto' }}>
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
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
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

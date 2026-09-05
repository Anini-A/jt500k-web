'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLockScroll } from '@/lib/lockScroll'
import { createPortal } from 'react-dom'
import { Bell, CheckCircle2 } from 'lucide-react'
import { getJSON } from '@/lib/fresh'

interface Notif { id: string; icon: string; title: string; detail: string; severity: 'info' | 'warn'; kind: 'action' | 'info'; dismissible: boolean }

// Top-left bell + a dedicated notification center panel. Replaces the on-Home
// alerts card: alerts now live in one organized place reachable from every page.
export default function NotificationBell() {
  const [items, setItems] = useState<Notif[] | null>(null)
  const [open, setOpen] = useState(false)
  useLockScroll(open) // the page behind a sheet stays put
  const [tab, setTab] = useState<'action' | 'info'>('action')

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
      <button onClick={() => { setTab(actions.length ? 'action' : 'info'); setOpen(true) }} aria-label={total ? `${total} alerts` : 'Alerts'} title="Alerts"
        style={{ position: 'relative', width: 40, height: 40, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-secondary)', cursor: 'pointer', overflow: 'visible', WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)' }}>
        <Bell size={18} />
        {total > 0 && (
          <span style={{ position: 'absolute', top: -5, right: -5, height: 19, minWidth: 19, boxSizing: 'border-box', padding: '0 5px', borderRadius: 999, fontSize: 11, fontWeight: 700, lineHeight: '15px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: urgent ? 'var(--expense)' : 'var(--accent)', border: '2px solid var(--page-plane)' }}>{total > 99 ? '99+' : total}</span>
        )}
      </button>

      {open && createPortal(
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-card glass modal-tall" style={{ width: 'min(560px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
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
              <>
                {/* segmented toggle — Needs action / Good to know */}
                <div style={{ flexShrink: 0, display: 'flex', gap: 3, background: 'var(--kpi-bg)', borderRadius: 999, padding: 3, marginBottom: 14 }}>
                  <TabPill active={tab === 'action'} onClick={() => setTab('action')} label="Needs action" count={actions.length} hot={actions.some((n) => n.severity === 'warn')} />
                  <TabPill active={tab === 'info'} onClick={() => setTab('info')} label="Good to know" count={infos.length} />
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tab === 'action' ? (
                    actions.length === 0 ? <Empty label="Nothing needs action" />
                      : actions.map((n) => <Item key={n.id} n={n} onDismiss={n.dismissible ? () => dismiss(n.id) : undefined} skip={n.dismissible} />)
                  ) : (
                    infos.length === 0 ? <Empty label="Nothing here right now" /> : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={clearInfo} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: 0, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear all</button>
                        </div>
                        {infos.map((n) => <Item key={n.id} n={n} onDismiss={() => dismiss(n.id)} />)}
                      </>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function TabPill({ active, onClick, label, count, hot }: { active: boolean; onClick: () => void; label: string; count: number; hot?: boolean }) {
  return (
    <button onClick={onClick} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: active ? 'var(--surface-1)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none' }}>
      {label}
      {count > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, fontSize: 11, fontWeight: 700, lineHeight: '18px', textAlign: 'center', color: '#fff', background: hot ? 'var(--expense)' : active ? 'var(--accent)' : 'var(--text-muted)' }}>{count}</span>}
    </button>
  )
}

function Empty({ label }: { label: string }) {
  return <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '28px 0' }}>{label}</div>
}

function Item({ n, onDismiss, skip }: { n: Notif; onDismiss?: () => void; skip?: boolean }) {
  const urgent = n.severity === 'warn'
  const dot = urgent ? 'var(--expense)' : n.kind === 'action' ? 'var(--accent)' : 'var(--text-muted)'
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '13px 14px', borderRadius: 14, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 6 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, overflowWrap: 'anywhere' }}>{n.detail}</div>
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

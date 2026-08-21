'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Inline confirm — replaces window.confirm across the app.
export function useConfirm() {
  const [p, setP] = useState<null | { title?: string; message?: string; confirmLabel?: string; run: () => void }>(null)
  const confirm = useCallback((opts: { title?: string; message?: string; confirmLabel?: string; run: () => void }) => setP(opts), [])
  const confirmNode = p && typeof document !== 'undefined' ? createPortal(
    <div onClick={() => setP(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', WebkitBackdropFilter: 'blur(3px)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, width: '100%', maxWidth: 340, boxShadow: '0 14px 40px rgba(0,0,0,0.38)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{p.title || 'Are you sure?'}</div>
        {p.message && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>{p.message}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: p.message ? 0 : 14 }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setP(null)}>Cancel</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center', background: 'var(--expense)', color: '#fff', border: 'none' }} onClick={() => { p.run(); setP(null) }}>{p.confirmLabel || 'Delete'}</button>
        </div>
      </div>
    </div>, document.body) : null
  return { confirm, confirmNode }
}

// Inline toast — replaces alert() for transient messages/errors.
export function useToast() {
  const [msg, setMsg] = useState('')
  const toast = useCallback((m: string) => { setMsg(m); window.clearTimeout((toast as any)._t); (toast as any)._t = window.setTimeout(() => setMsg(''), 2800) }, [])
  const toastNode = msg && typeof document !== 'undefined' ? createPortal(
    <div style={{ position: 'fixed', left: '50%', bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))', transform: 'translateX(-50%)', zIndex: 320, background: 'var(--text-primary)', color: 'var(--surface-1)', padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(0,0,0,0.3)', maxWidth: '90vw', textAlign: 'center' }}>{msg}</div>,
    document.body) : null
  return { toast, toastNode }
}

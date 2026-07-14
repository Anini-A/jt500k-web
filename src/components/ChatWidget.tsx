'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Msg { role: 'user' | 'assistant'; content: string }
interface Thread { id: string; msgs: Msg[]; updatedAt: number }

const SUGGESTIONS = [
  'How am I doing toward 500K?',
  'Where can I cut spending?',
  'What was my best savings month?',
]

const GREETING: Msg = { role: 'assistant', content: "Hi! I'm your finance assistant. Ask me anything about your income, spending, or your journey to $500K." }
const STORE_KEY = 'jt-chats'
const MAX_THREADS = 20

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const titleOf = (t: Thread) => {
  const firstUser = t.msgs.find((m) => m.role === 'user')?.content
  return (firstUser || 'New chat').replace(/\s+/g, ' ').trim().slice(0, 40) || 'New chat'
}
const ago = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

// Inline **bold** → <strong> (the only inline markup the model uses much)
function inline(text: string, keyBase: string) {
  const out: React.ReactNode[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<strong key={`${keyBase}-${k++}`}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// Minimal markdown → JSX: **bold**, "* / -" bullet lists, "#" headings, blank lines.
function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let list: React.ReactNode[] | null = null
  const flush = () => { if (list) { blocks.push(<ul key={`u${blocks.length}`} style={{ margin: '4px 0', paddingLeft: 20, display: 'grid', gap: 3 }}>{list}</ul>); list = null } }

  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[*-]\s+(.*)/)
    if (bullet) {
      if (!list) list = []
      list.push(<li key={i}>{inline(bullet[1], `l${i}`)}</li>)
      return
    }
    flush()
    if (line.trim() === '') { blocks.push(<div key={i} style={{ height: 6 }} />); return }
    const h = line.match(/^#{1,6}\s+(.*)/)
    if (h) blocks.push(<div key={i} style={{ fontWeight: 700, margin: '4px 0 2px' }}>{inline(h[1], `h${i}`)}</div>)
    else blocks.push(<div key={i}>{inline(line, `p${i}`)}</div>)
  })
  flush()
  return <>{blocks}</>
}

function loadStore(): { threads: Thread[]; activeId: string } {
  const fresh: Thread = { id: uid(), msgs: [GREETING], updatedAt: Date.now() }
  if (typeof window === 'undefined') return { threads: [fresh], activeId: fresh.id }
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
    if (s && Array.isArray(s.threads) && s.threads.length) {
      const activeId = s.threads.some((t: Thread) => t.id === s.activeId) ? s.activeId : s.threads[0].id
      return { threads: s.threads, activeId }
    }
    // migrate an old single-thread store if present
    const old = JSON.parse(localStorage.getItem('jt-chat') || 'null')
    if (Array.isArray(old) && old.length) {
      const t: Thread = { id: uid(), msgs: old, updatedAt: Date.now() }
      return { threads: [t], activeId: t.id }
    }
  } catch { /* ignore */ }
  return { threads: [fresh], activeId: fresh.id }
}

// Centered modal chat (opened from the header nav). Fixed size — it never grows
// while you type; only the message area scrolls. Threads are persisted so you
// can resume, start a new chat, or jump back to a recent one.
export default function ChatWidget({ onClose }: { onClose: () => void }) {
  const [{ threads, activeId }, setStore] = useState(loadStore)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ name: string; args: any; label: string }[] | null>(null)
  const [recentOpen, setRecentOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const active = threads.find((t) => t.id === activeId) || threads[0]
  const msgs = active?.msgs ?? [GREETING]

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ threads, activeId })) } catch { /* ignore */ }
  }, [threads, activeId])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [msgs, activeId])

  // auto-grow the composer as you type / wrap, up to a max then scroll
  useEffect(() => {
    const el = taRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px' }
  }, [input])

  // update the active thread's messages (accepts a value or updater fn)
  const setMsgs = (v: Msg[] | ((p: Msg[]) => Msg[])) => {
    setStore((s) => {
      const cur = s.threads.find((t) => t.id === s.activeId)
      const nextMsgs = typeof v === 'function' ? (v as (p: Msg[]) => Msg[])(cur?.msgs ?? [GREETING]) : v
      return { ...s, threads: s.threads.map((t) => t.id === s.activeId ? { ...t, msgs: nextMsgs, updatedAt: Date.now() } : t) }
    })
  }

  const newChat = () => {
    setPending(null); setRecentOpen(false)
    setStore((s) => {
      const cur = s.threads.find((t) => t.id === s.activeId)
      if (cur && cur.msgs.length <= 1) return s // already a fresh chat
      const t: Thread = { id: uid(), msgs: [GREETING], updatedAt: Date.now() }
      return { threads: [t, ...s.threads].slice(0, MAX_THREADS), activeId: t.id }
    })
  }

  const selectThread = (id: string) => { setPending(null); setRecentOpen(false); setStore((s) => ({ ...s, activeId: id })) }

  const deleteThread = (id: string) => setStore((s) => {
    const remaining = s.threads.filter((t) => t.id !== id)
    if (!remaining.length) { const t: Thread = { id: uid(), msgs: [GREETING], updatedAt: Date.now() }; return { threads: [t], activeId: t.id } }
    return { threads: remaining, activeId: s.activeId === id ? remaining[0].id : s.activeId }
  })

  const clearAll = () => {
    if (!confirm('Delete all chats? This cannot be undone.')) return
    setPending(null); setRecentOpen(false)
    const t: Thread = { id: uid(), msgs: [GREETING], updatedAt: Date.now() }
    setStore({ threads: [t], activeId: t.id })
  }

  const send = async (text: string) => {
    if (!text.trim() || busy) return
    const next = [...msgs, { role: 'user' as const, content: text }]
    setMsgs(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: msgs.filter((m, i) => i > 0).map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      if (data.actions?.length) {
        setPending(data.actions)
      } else {
        setMsgs([...next, { role: 'assistant', content: data.reply || data.error || 'Something went wrong.' }])
      }
    } catch {
      setMsgs([...next, { role: 'assistant', content: 'Network error — please try again.' }])
    } finally {
      setBusy(false)
    }
  }

  // Execute a confirmed action against the existing write endpoints.
  const runAction = async (name: string, a: any) => {
    const j = (url: string, method: string, body?: any) =>
      fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    switch (name) {
      case 'add_transaction': return j('/api/transactions', 'POST', { date: a.date || new Date().toISOString().slice(0, 10), type: a.type, category: a.category, amount: Number(a.amount), description: a.description })
      case 'edit_transaction': return j('/api/transactions', 'PATCH', a)
      case 'delete_transaction': return fetch(`/api/transactions?id=${a.id}`, { method: 'DELETE' })
      case 'add_budget_item': return j('/api/budgets', 'POST', { name: a.name, category: a.category, amount: Number(a.amount) })
      case 'edit_budget_item': return j('/api/budgets', 'PATCH', a)
      case 'delete_budget_item': return fetch(`/api/budgets?id=${a.id}`, { method: 'DELETE' })
      case 'add_recurring': return j('/api/recurring', 'POST', { name: a.name, type: a.type, category: a.category, amount: Number(a.amount), description: a.description })
      case 'edit_recurring': return j('/api/recurring', 'PATCH', a)
      case 'log_recurring': {
        const date = a.date || new Date().toISOString().slice(0, 10)
        const list = await (await fetch('/api/recurring')).json()
        const ids = new Set((a.ids || []).map(String))
        const chosen = (Array.isArray(list) ? list : []).filter((r: any) => ids.has(String(r.id)) && r.active)
        if (!chosen.length) throw new Error('no matching recurring items found')
        return j('/api/transactions', 'POST', chosen.map((r: any) => ({ date, type: r.type, category: r.category, amount: Number(r.amount), description: r.description || r.name })))
      }
      case 'set_goal': return j('/api/settings', 'PUT', { goalAmount: Number(a.amount) })
      case 'refresh_prices': return fetch('/api/holdings/refresh', { method: 'POST' })
      default: throw new Error('Unknown action')
    }
  }

  const confirmAction = async () => {
    if (!pending) return
    setBusy(true)
    let okCount = 0
    const fails: string[] = []
    for (const act of pending) {
      try {
        const res = await runAction(act.name, act.args)
        if (res.ok) okCount++
        else { const e = await res.json().catch(() => ({})); fails.push(`${act.label} (${e.error || 'rejected'})`) }
      } catch (err: any) {
        fails.push(`${act.label} (${err.message})`)
      }
    }
    if (okCount) window.dispatchEvent(new CustomEvent('transaction-added'))
    const lines: string[] = []
    if (okCount) lines.push(`✅ Done — ${okCount} change${okCount !== 1 ? 's' : ''} saved.`)
    if (fails.length) lines.push(`⚠️ ${fails.length} couldn't be applied:\n${fails.map((f) => `- ${f}`).join('\n')}`)
    setMsgs((m) => [...m, { role: 'assistant', content: lines.join('\n\n') || 'Nothing changed.' }])
    setPending(null)
    setBusy(false)
  }

  const cancelAction = () => {
    setMsgs((m) => [...m, { role: 'assistant', content: 'Okay, cancelled — nothing was saved.' }])
    setPending(null)
  }

  const recents = [...threads].sort((a, b) => b.updatedAt - a.updatedAt)

  const ctrlBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card glass" onClick={(e) => { e.stopPropagation(); setRecentOpen(false) }}
        style={{ width: 'min(720px, 100%)', height: 'min(88vh, 760px)', maxHeight: '88vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface-1)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <h2 style={{ margin: 0, fontSize: 18, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🤖 Ask Gemini</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button style={ctrlBtn} title="Recent chats" onClick={(e) => { e.stopPropagation(); setRecentOpen((v) => !v) }}>Recent ▾</button>
            <button style={ctrlBtn} title="Start a new chat" onClick={newChat}>New chat</button>
            <button className="modal-x" aria-label="Close" onClick={onClose}>✕</button>
          </div>

          {recentOpen && (
            <div onClick={(e) => e.stopPropagation()}
              style={{ position: 'absolute', top: 52, right: 12, zIndex: 5, width: 'min(320px, 80%)', maxHeight: 320, overflowY: 'auto', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--glass-shadow)', padding: 6 }}>
              {recents.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => selectThread(t.id)}
                    style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, textAlign: 'left', padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', background: t.id === activeId ? 'var(--kpi-bg)' : 'transparent', color: 'var(--text-primary)' }}>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(t)}</span>
                    <span className="stat-label" style={{ flexShrink: 0 }}>{ago(t.updatedAt)}</span>
                  </button>
                  <button onClick={() => deleteThread(t.id)} aria-label="Delete chat" title="Delete chat"
                    style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
                <button onClick={clearAll}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', background: 'transparent', color: 'var(--expense)', fontWeight: 600 }}>🗑 Clear all chats</button>
              </div>
            </div>
          )}
        </div>

        {/* Messages (the only part that scrolls) */}
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%', padding: '10px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.5,
              whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal',
              background: m.role === 'user' ? 'var(--accent)' : 'var(--kpi-bg)',
              color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
              border: m.role === 'user' ? 'none' : '1px solid var(--border)',
            }}>{m.role === 'user' ? m.content : <Markdown text={m.content} />}</div>
          ))}
          {busy && <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: 13 }}>Gemini is thinking…</div>}

          {msgs.length === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} style={{
                  textAlign: 'left', padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--border)', color: 'var(--accent)', fontSize: 13,
                }}>{s}</button>
              ))}
            </div>
          )}
        </div>

        {/* Confirm-before-write card */}
        {pending && (
          <div style={{ flexShrink: 0, padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--kpi-bg)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              Confirm {pending.length > 1 ? `these ${pending.length} changes` : 'this change'}?
            </div>
            <ul style={{ margin: '0 0 10px', paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
              {pending.map((p, i) => <li key={i}>{p.label}</li>)}
            </ul>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '9px 14px' }} disabled={busy} onClick={confirmAction}>✓ Confirm</button>
              <button className="btn" style={{ background: 'var(--expense-soft)', color: 'var(--expense)', border: '1px solid var(--expense)', padding: '9px 14px' }} disabled={busy} onClick={cancelAction}>✗ Cancel</button>
            </div>
          </div>
        )}

        {/* Composer — expandable, wraps to new lines; fixed at the bottom */}
        <form onSubmit={(e) => { e.preventDefault(); send(input) }}
          style={{ flexShrink: 0, padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={taRef} value={input} rows={1} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder="Ask a question…" autoFocus
            /* fontSize 16 keeps iOS Safari from auto-zooming the page on focus */
            style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 16, fontFamily: 'inherit', lineHeight: 1.4, resize: 'none', maxHeight: 160, overflowY: 'auto' }}
          />
          <button type="submit" disabled={busy} className="btn btn-primary" style={{ padding: '10px 16px', flexShrink: 0 }}>➤</button>
        </form>
      </div>
    </div>,
    document.body,
  )
}

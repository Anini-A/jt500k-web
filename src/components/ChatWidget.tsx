'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'How am I doing toward 500K?',
  'Where can I cut spending?',
  'What was my best savings month?',
]

const GREETING: Msg = { role: 'assistant', content: "Hi! I'm your finance assistant. Ask me anything about your income, spending, or your journey to $500K." }
const STORE_KEY = 'jt-chat'

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

// Centered modal chat (opened from the header nav). Fixed size — it never grows
// while you type; only the message area scrolls. The thread is persisted so
// closing and reopening resumes where you left off.
export default function ChatWidget({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
        if (Array.isArray(saved) && saved.length) return saved
      } catch { /* ignore */ }
    }
    return [GREETING]
  })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [msgs])

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(msgs)) } catch { /* ignore */ }
  }, [msgs])

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
      setMsgs([...next, { role: 'assistant', content: data.reply || data.error || 'Something went wrong.' }])
    } catch {
      setMsgs([...next, { role: 'assistant', content: 'Network error — please try again.' }])
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card glass" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', height: 'min(78vh, 620px)', maxHeight: '78vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface-1)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>🤖 Ask Gemini about your finances</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setMsgs([GREETING])} title="Start a new chat"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              New chat
            </button>
            <button className="modal-x" aria-label="Close" onClick={onClose}>✕</button>
          </div>
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

        {/* Composer — fixed at the bottom */}
        <form onSubmit={(e) => { e.preventDefault(); send(input) }}
          style={{ flexShrink: 0, padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input
            value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" autoFocus
            style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14 }}
          />
          <button type="submit" disabled={busy} className="btn btn-primary" style={{ padding: '10px 16px' }}>➤</button>
        </form>
      </div>
    </div>,
    document.body,
  )
}

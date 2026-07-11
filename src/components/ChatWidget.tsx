'use client'

import { useState, useRef, useEffect } from 'react'

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'How am I doing toward 500K?',
  'Where can I cut spending?',
  'What was my best savings month?',
]

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', content: "Hi! I'm your finance assistant. Ask me anything about your income, spending, or your journey to $500K." },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [msgs, open])

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

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat with Claude"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 50,
          width: 60, height: 60, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: '#fff', fontSize: 26,
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
        }}
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Panel */}
      {open && (
        <div className="glass" style={{
          position: 'fixed', bottom: 96, right: 24, zIndex: 50,
          width: 'min(380px, calc(100vw - 48px))', height: 'min(520px, calc(100vh - 140px))',
          borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
            🤖 Ask Claude about your finances
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%', padding: '10px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'var(--accent)' : 'var(--kpi-bg)',
                color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
              }}>{m.content}</div>
            ))}
            {busy && <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: 13 }}>Claude is thinking…</div>}

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

          <form onSubmit={(e) => { e.preventDefault(); send(input) }}
            style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14 }}
            />
            <button type="submit" disabled={busy} className="btn btn-primary" style={{ padding: '10px 16px' }}>➤</button>
          </form>
        </div>
      )}
    </>
  )
}

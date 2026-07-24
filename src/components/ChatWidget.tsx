'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, SquarePen, History, ArrowUp, Sparkles, Trash2, Check, X, Mic, Volume2, VolumeX } from 'lucide-react'
import { today } from '@/lib/date'

interface Msg { role: 'user' | 'assistant'; content: string; at?: number }
interface Thread { id: string; msgs: Msg[]; updatedAt: number }
const timeOf = (at?: number) => at ? new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase() : ''
// strip markdown so speech reads naturally
const plain = (t: string) => t.replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, '').replace(/^\s*[*-]\s+/gm, '').replace(/`/g, '').trim()

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
  const [listening, setListening] = useState(false)   // mic actively capturing
  const [speaking, setSpeaking] = useState(false)     // TTS is reading a reply
  const [voiceMode, setVoiceMode] = useState(false)   // hands-free conversation on
  const [micOK, setMicOK] = useState(false)
  const [speak, setSpeak] = useState(true)            // read answers aloud
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const recogRef = useRef<any>(null)
  const finalRef = useRef('')      // accumulated final transcript for the current turn
  const emptyRef = useRef(0)       // consecutive empty listens (iOS ends early) — cap restarts
  const voiceModeRef = useRef(false)
  const speakRef = useRef(true)
  const sendRef = useRef<(t: string) => void>(() => {})
  const listenRef = useRef<() => void>(() => {})
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const iosRef = useRef(false) // iOS can't restart recognition without a tap → tap-to-talk
  const useRecorderRef = useRef(false) // iOS PWA: record audio + transcribe via Gemini instead of SpeechRecognition
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // pick the most natural-sounding English voice available
  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth) return
    const pick = () => {
      const vs = synth.getVoices() || []
      const en = vs.filter((v) => /^en/i.test(v.lang))
      const pref = ['Google UK English Female', 'Google US English', 'Samantha', 'Ava', 'Serena', 'Karen', 'Moira', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Michelle']
      voiceRef.current =
        pref.map((n) => en.find((v) => v.name.includes(n))).find(Boolean) ||
        en.find((v) => /natural|neural|enhanced|premium/i.test(v.name)) ||
        en.find((v) => v.localService) || en[0] || vs[0] || null
    }
    pick()
    synth.onvoiceschanged = pick
    return () => { synth.onvoiceschanged = null }
  }, [])

  useEffect(() => { voiceModeRef.current = voiceMode }, [voiceMode])
  useEffect(() => { speakRef.current = speak }, [speak])
  useEffect(() => {
    const ua = navigator.userAgent || ''
    iosRef.current = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
    const hasSR = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    const hasRec = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    // iOS blocks SpeechRecognition (esp. in the PWA) → use audio recording + Gemini transcription
    useRecorderRef.current = iosRef.current && hasRec
    setMicOK(hasSR || useRecorderRef.current)
    try { setSpeak(localStorage.getItem('jt-chat-speak') !== 'off') } catch { /* ignore */ }
  }, [])
  useEffect(() => { try { localStorage.setItem('jt-chat-speak', speak ? 'on' : 'off') } catch { /* ignore */ } }, [speak])
  useEffect(() => () => { try { recogRef.current?.abort?.(); mediaRef.current?.stop(); streamRef.current?.getTracks().forEach((t) => t.stop()); window.speechSynthesis?.cancel() } catch { /* ignore */ } }, [])

  const stopSpeaking = () => { try { window.speechSynthesis?.cancel() } catch { /* ignore */ } setSpeaking(false) }
  // Text-to-speech — read a reply aloud, then run onDone (used to resume listening)
  const say = (text: string, onDone?: () => void) => {
    const synth = window.speechSynthesis
    if (!synth || !text.trim() || !speakRef.current) { onDone?.(); return }
    synth.cancel()
    const u = new SpeechSynthesisUtterance(plain(text))
    if (voiceRef.current) u.voice = voiceRef.current
    u.lang = voiceRef.current?.lang || 'en-CA'
    u.rate = 1.0; u.pitch = 1.0 // natural cadence
    const done = () => { setSpeaking(false); onDone?.() }
    u.onend = done
    u.onerror = done
    setSpeaking(true)
    synth.speak(u)
  }

  // Start a listening turn. In voice mode, ending with speech auto-sends; ending
  // empty restarts (handles iOS Safari ending recognition prematurely).
  const startListen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    try { recogRef.current?.abort?.() } catch { /* ignore */ }
    const r = new SR()
    r.lang = 'en-CA'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1
    finalRef.current = ''
    r.onresult = (e: any) => {
      let interim = '', fin = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) fin += res[0].transcript; else interim += res[0].transcript
      }
      if (fin) finalRef.current += fin
      setInput((finalRef.current + interim).trim())
    }
    // Any error → just stop this turn and go idle. NEVER exit voice mode (that caused the
    // overlay to flash back to the chat with a stuck waveform). User taps the orb to retry.
    r.onerror = () => { setListening(false); recogRef.current = null }
    r.onend = () => {
      setListening(false); recogRef.current = null
      if (!voiceModeRef.current) return
      const text = finalRef.current.trim()
      if (text) { emptyRef.current = 0; setInput(''); sendRef.current(text) } // heard something → send
      // nothing heard: on desktop/Android keep auto-listening; on iOS go idle ("Tap to talk")
      else if (!iosRef.current && emptyRef.current++ < 5) setTimeout(() => { if (voiceModeRef.current && !recogRef.current) startListen() }, 180)
      // else: idle — stay in voice mode, wait for a tap
    }
    recogRef.current = r
    setListening(true)
    try { r.start() } catch { setListening(false) }
  }
  listenRef.current = startListen

  // ── iOS path: record audio, transcribe with Gemini ──
  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = ['audio/mp4', 'audio/webm', 'audio/aac'].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
        streamRef.current = null
        setListening(false)
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/mp4' })
        if (!blob.size) return
        setBusy(true)
        try {
          const b64 = await new Promise<string>((res, rej) => {
            const fr = new FileReader()
            fr.onloadend = () => res(String(fr.result).split(',')[1] || '')
            fr.onerror = rej
            fr.readAsDataURL(blob)
          })
          const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: b64, mime: blob.type }) })
          const d = await r.json()
          const text = (d.text || '').trim()
          setBusy(false)
          if (text) { setInput(''); sendRef.current(text) }
        } catch { setBusy(false) }
      }
      mediaRef.current = mr
      setListening(true)
      mr.start()
    } catch { setListening(false) } // permission denied / no mic
  }
  const stopRecord = () => { try { mediaRef.current?.stop() } catch { /* ignore */ } }

  // one place the orb/mic calls — record (iOS) vs SpeechRecognition (elsewhere)
  const onTalk = () => {
    stopSpeaking()
    if (useRecorderRef.current) { listening ? stopRecord() : startRecord() }
    else startListen()
  }

  // mic button: toggle hands-free conversation
  const toggleVoice = () => {
    if (!micOK) return
    if (voiceMode) {
      setVoiceMode(false); voiceModeRef.current = false
      try { recogRef.current?.abort?.(); mediaRef.current?.stop() } catch { /* ignore */ }
      stopSpeaking(); setListening(false)
    } else {
      stopSpeaking(); setVoiceMode(true); voiceModeRef.current = true; emptyRef.current = 0
      // iOS taps to talk; desktop/Android auto-starts the listen loop
      if (!iosRef.current) startListen()
    }
  }

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
    stopSpeaking() // cut off any answer being read
    const next = [...msgs, { role: 'user' as const, content: text, at: Date.now() }]
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
          clientDate: today(), // the user's LOCAL date, so "today/this month" is correct
          voice: voiceModeRef.current, // short, speakable answers in conversation mode
        }),
      })
      const data = await res.json()
      // hands-free: auto-listen again after the answer — but NOT on iOS (needs a tap; idles instead)
      const resume = () => { if (voiceModeRef.current && !iosRef.current) listenRef.current() }
      if (data.actions?.length) {
        setPending(data.actions)
        // confirm inside the current mode — speak the prompt if in voice
        if (voiceModeRef.current) say(data.actions.length === 1 ? `${data.actions[0].label}. Confirm or cancel?` : `${data.actions.length} changes. Confirm or cancel?`)
      } else {
        const reply = data.reply || data.error || 'Something went wrong.'
        setMsgs([...next, { role: 'assistant', content: reply, at: Date.now() }])
        if (data.reply) say(reply, resume); else resume()
      }
    } catch {
      setMsgs([...next, { role: 'assistant', content: 'Network error — please try again.', at: Date.now() }])
    } finally {
      setBusy(false)
    }
  }
  sendRef.current = send

  // resolve a bill-account by name (falls back to the only account if there's one)
  const findBillAccount = async (nameLike: string) => {
    const d = await (await fetch('/api/bill-accounts')).json().catch(() => ({}))
    const accs: any[] = d?.accounts || []
    const want = String(nameLike || '').trim().toLowerCase()
    return accs.find((x) => String(x.name).trim().toLowerCase() === want)
      || accs.find((x) => String(x.name).trim().toLowerCase().includes(want))
      || (accs.length === 1 ? accs[0] : null)
  }

  // Execute a confirmed action against the existing write endpoints.
  const runAction = async (name: string, a: any) => {
    const j = (url: string, method: string, body?: any) =>
      fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    switch (name) {
      case 'add_transaction': return j('/api/transactions', 'POST', { date: a.date || today(), type: a.type, category: a.category, amount: Number(a.amount), description: a.description })
      case 'edit_transaction': return j('/api/transactions', 'PATCH', a)
      case 'delete_transaction': return fetch(`/api/transactions?id=${a.id}`, { method: 'DELETE' })
      case 'add_budget_item': return j('/api/budgets', 'POST', { name: a.name, category: a.category, amount: Number(a.amount) })
      case 'edit_budget_item': return j('/api/budgets', 'PATCH', a)
      case 'delete_budget_item': return fetch(`/api/budgets?id=${a.id}`, { method: 'DELETE' })
      case 'add_recurring': return j('/api/recurring', 'POST', { name: a.name, type: a.type, category: a.category, amount: Number(a.amount), description: a.description })
      case 'edit_recurring': return j('/api/recurring', 'PATCH', a)
      case 'log_recurring': {
        const date = a.date || today()
        const list = await (await fetch('/api/recurring')).json()
        const ids = new Set((a.ids || []).map(String))
        const chosen = (Array.isArray(list) ? list : []).filter((r: any) => ids.has(String(r.id)) && r.active)
        if (!chosen.length) throw new Error('no matching recurring items found')
        return j('/api/transactions', 'POST', chosen.map((r: any) => ({ date, type: r.type, category: r.category, amount: Number(r.amount), description: r.description || r.name })))
      }
      case 'set_goal': return j('/api/settings', 'PUT', { goalAmount: Number(a.amount) })
      case 'add_debt': return j('/api/debts', 'POST', { name: a.name, amount: Number(a.amount) })
      case 'edit_debt': return j('/api/debts', 'PATCH', a)
      case 'delete_debt': return fetch(`/api/debts?id=${a.id}`, { method: 'DELETE' })
      case 'delete_recurring': return fetch(`/api/recurring?id=${a.id}`, { method: 'DELETE' })
      case 'refresh_prices': return fetch('/api/holdings/refresh', { method: 'POST' })
      case 'set_bill_balance': {
        const acc = await findBillAccount(a.account)
        if (!acc) throw new Error(`no bill account called "${a.account}"`)
        return j('/api/bill-accounts', 'PATCH', { id: acc.id, current_balance: Number(a.current_balance), balance_as_of: a.balance_as_of, buffer: a.buffer })
      }
      case 'add_bill': {
        const acc = await findBillAccount(a.account)
        if (!acc) throw new Error(`no bill account called "${a.account}"`)
        return j('/api/bills', 'POST', { account_id: acc.id, name: a.name, day: a.day, amount: Number(a.amount), quarterly: !!a.quarterly, next_due: a.next_due })
      }
      case 'edit_bill': return j('/api/bills', 'PATCH', a)
      case 'delete_bill': return fetch(`/api/bills?id=${a.id}`, { method: 'DELETE' })
      case 'update_household_item': {
        const prof = await (await fetch('/api/profile')).json()
        const sections = prof?.sections || []
        const want = String(a.label || '').trim().toLowerCase()
        let hit: any = null
        for (const s of sections) for (const it of (s.items || [])) {
          if (String(it.label || '').trim().toLowerCase() === want) { hit = it; break }
        }
        if (!hit) throw new Error(`no household item called "${a.label}"`)
        if (a.status) hit.status = a.status
        if (a.value != null) hit.value = a.value
        return j('/api/profile', 'PUT', prof)
      }
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
    const summary = lines.join('\n\n') || 'Nothing changed.'
    setMsgs((m) => [...m, { role: 'assistant', content: summary, at: Date.now() }])
    setPending(null)
    setBusy(false)
    if (voiceModeRef.current) say(okCount ? `Done. ${okCount} change${okCount !== 1 ? 's' : ''} saved.` : summary, () => { if (voiceModeRef.current && !iosRef.current) listenRef.current() })
  }

  const cancelAction = () => {
    setMsgs((m) => [...m, { role: 'assistant', content: 'Okay, cancelled — nothing was saved.', at: Date.now() }])
    setPending(null)
    if (voiceModeRef.current) say('Cancelled.', () => { if (voiceModeRef.current && !iosRef.current) listenRef.current() })
  }

  const recents = [...threads].sort((a, b) => b.updatedAt - a.updatedAt)

  const roundBtn: React.CSSProperties = { width: 38, height: 38, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-primary)', cursor: 'pointer' }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card glass" onClick={(e) => { e.stopPropagation(); setRecentOpen(false) }}
        style={{ width: 'min(720px, 100%)', height: 'min(88vh, 760px)', maxHeight: '88vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface-1)', position: 'relative' }}>

        {/* Hands-free voice UI — replaces the text chat while a conversation is on */}
        {voiceMode && (
          <div className="voice-overlay">
            <button style={roundBtn} aria-label="Back to chat" title="Back to chat" onClick={toggleVoice}><ArrowLeft size={20} /></button>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, padding: '0 24px', textAlign: 'center' }}>
              <div className="voice-orb-wrap">
                <button type="button" aria-label="Tap to talk" onClick={onTalk}
                  className={`voice-orb ${pending ? 'is-idle' : listening ? 'is-listening' : busy ? 'is-thinking' : speaking ? 'is-speaking' : 'is-idle'}`} />
              </div>
              {pending ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)' }}>Confirm {pending.length > 1 ? `${pending.length} changes` : 'this change'}</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, maxWidth: 460, width: '100%' }}>
                    {pending.map((p, i) => (
                      <li key={i} style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px' }}>{p.label}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: listening ? 'var(--expense)' : 'var(--accent)' }}>
                    {listening ? 'Listening' : busy ? 'Thinking' : speaking ? 'Speaking' : 'Tap to talk'}
                  </div>
                  <div style={{ fontSize: 19, lineHeight: 1.55, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)', maxWidth: 460, minHeight: 62 }}>
                    {listening
                      ? (input || <span style={{ color: 'var(--text-muted)' }}>{useRecorderRef.current ? 'Recording… tap the orb when done.' : 'Say something…'}</span>)
                      : ([...msgs].reverse().find((m) => m.role === 'assistant')?.content || <span style={{ color: 'var(--text-muted)' }}>Tap the orb and speak.</span>)}
                  </div>
                </>
              )}
            </div>

            {pending ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 8 }}>
                <button className="btn" onClick={cancelAction} disabled={busy} style={{ background: 'var(--kpi-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '12px 22px' }}><X size={16} /> Cancel</button>
                <button className="btn btn-primary" onClick={confirmAction} disabled={busy} style={{ padding: '12px 26px', gap: 6 }}><Check size={16} /> Confirm</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, paddingBottom: 8 }}>
                <button className="voice-ctrl" onClick={() => setSpeak((v) => { if (v) stopSpeaking(); return !v })} aria-label="Toggle voice output" title={speak ? 'Mute' : 'Unmute'}
                  style={{ color: speak ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {speak ? <Volume2 size={22} /> : <VolumeX size={22} />}
                </button>
                <button className={`voice-mic ${listening ? 'mic-live' : ''}`} onClick={onTalk} aria-label="Talk">
                  <Mic size={30} />
                </button>
                <button className="voice-ctrl" onClick={toggleVoice} aria-label="End voice conversation" title="End">
                  <X size={22} />
                </button>
              </div>
            )}
          </div>
        )}
        {/* Header — back (close) · title · history + new chat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <button style={roundBtn} aria-label="Close" title="Close" onClick={onClose}><ArrowLeft size={20} /></button>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 17, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Sparkles size={17} /> Ask Gemini</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button style={{ ...roundBtn, color: speak ? 'var(--accent)' : 'var(--text-muted)' }} title={speak ? 'Mute voice replies' : 'Speak replies aloud'} aria-label="Toggle spoken replies"
              onClick={() => { setSpeak((v) => { if (v) stopSpeaking(); return !v }) }}>{speak ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
            <button style={roundBtn} title="Recent chats" onClick={(e) => { e.stopPropagation(); setRecentOpen((v) => !v) }}><History size={19} /></button>
            <button style={roundBtn} title="New chat" onClick={newChat}><SquarePen size={19} /></button>
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
                  style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', background: 'transparent', color: 'var(--expense)', fontWeight: 600 }}><Trash2 size={14} /> Clear all chats</button>
              </div>
            </div>
          )}
        </div>

        {/* Messages (the only part that scrolls) */}
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.at && <div style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 6px' }}>{timeOf(m.at)}</div>}
              <div style={{
                maxWidth: '86%', padding: '11px 14px', borderRadius: 18, fontSize: 14, lineHeight: 1.5,
                whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal',
                background: m.role === 'user' ? 'var(--accent)' : 'var(--kpi-bg)',
                color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                borderBottomRightRadius: m.role === 'user' ? 6 : 18,
                borderBottomLeftRadius: m.role === 'user' ? 18 : 6,
              }}>{m.role === 'user' ? m.content : <Markdown text={m.content} />}</div>
            </div>
          ))}
          {busy && <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: 13, padding: '0 4px' }}>Gemini is thinking…</div>}

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
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '9px 14px', gap: 6 }} disabled={busy} onClick={confirmAction}><Check size={15} /> Confirm</button>
              <button className="btn" style={{ background: 'var(--expense-soft)', color: 'var(--expense)', border: '1px solid var(--expense)', padding: '9px 14px', gap: 6 }} disabled={busy} onClick={cancelAction}><X size={15} /> Cancel</button>
            </div>
          </div>
        )}

        {/* Composer — expandable, wraps to new lines; fixed at the bottom */}
        <form onSubmit={(e) => { e.preventDefault(); send(input) }}
          style={{ flexShrink: 0, padding: '10px 12px 8px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={taRef} value={input} rows={1} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder="Ask anything" autoFocus
              /* fontSize 16 keeps iOS Safari from auto-zooming the page on focus */
              style={{ flex: 1, minWidth: 0, padding: '11px 16px', borderRadius: 22, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 16, fontFamily: 'inherit', lineHeight: 1.4, resize: 'none', maxHeight: 160, overflowY: 'auto' }}
            />
            {micOK && (
              <button type="button" onClick={toggleVoice} aria-label={voiceMode ? 'Stop voice conversation' : 'Start voice conversation'} title={voiceMode ? 'Stop voice' : 'Talk (hands-free)'}
                className={listening ? 'mic-live' : ''}
                style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: voiceMode ? 'var(--expense)' : 'var(--kpi-bg)', color: voiceMode ? '#fff' : 'var(--text-secondary)', border: `1px solid ${voiceMode ? 'var(--expense)' : 'var(--border)'}` }}>
                <Mic size={20} />
              </button>
            )}
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
              style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 999, border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: input.trim() ? 'var(--accent)' : 'var(--border)', color: '#fff', opacity: busy ? 0.6 : 1 }}>
              <ArrowUp size={20} />
            </button>
          </div>
          {listening ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 8 }}>
              <span className="wave" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></span>
              <span style={{ fontSize: 12, color: 'var(--expense)', fontWeight: 600 }}>Listening…</span>
            </div>
          ) : voiceMode ? (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginTop: 7 }}>{busy ? 'Thinking…' : 'Speaking… tap the mic to end'}</div>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 7 }}>Gemini can make mistakes — double-check important numbers.</div>
          )}
        </form>
      </div>
    </div>,
    document.body,
  )
}

'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { SquarePen, History, ArrowUp, Trash2, Check, X, AudioLines, MessageSquare } from 'lucide-react'
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

// Every time the chat opens it starts a NEW conversation (per user preference) —
// older threads stay reachable via "Recent chats", they just aren't resumed automatically.
function loadStore(): { threads: Thread[]; activeId: string } {
  const fresh: Thread = { id: uid(), msgs: [GREETING], updatedAt: Date.now() }
  if (typeof window === 'undefined') return { threads: [fresh], activeId: fresh.id }
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
    if (s && Array.isArray(s.threads) && s.threads.length) {
      // reopen the last active conversation (fall back to the most recent one)
      const active = s.threads.some((t: Thread) => t.id === s.activeId)
        ? s.activeId
        : [...s.threads].sort((a: Thread, b: Thread) => b.updatedAt - a.updatedAt)[0].id
      return { threads: s.threads, activeId: active }
    }
    // migrate an old single-thread store if present
    const old = JSON.parse(localStorage.getItem('jt-chat') || 'null')
    if (Array.isArray(old) && old.length) {
      const t: Thread = { id: uid(), msgs: old, updatedAt: Date.now() }
      return { threads: [fresh, t], activeId: fresh.id }
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
  const [voiceError, setVoiceError] = useState('')     // visible mic/permission error (was silently swallowed)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null) // "Copied ✓" flash
  const [actionIdx, setActionIdx] = useState<number | null>(null) // which message's long-press menu is open
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const voiceModeRef = useRef(false)
  const speakRef = useRef(true)
  const sendRef = useRef<(t: string) => void>(() => {})
  const beginSegmentRef = useRef<() => void>(() => {})
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  // ── unified voice engine (identical on desktop, Android, iOS) ──
  // one mic stream kept open for the whole conversation; each "turn" is a
  // MediaRecorder segment that auto-stops on silence, transcribed via Gemini.
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrRef = useRef<Uint8Array | null>(null)
  const rafRef = useRef<number | null>(null)
  const noSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silenceHangTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechDetectedRef = useRef(false)      // has THIS segment heard actual speech yet
  const silentAccumRef = useRef(0)             // ms of consecutive no-speech segments this session
  // live captions (SpeechRecognition, best-effort): shows your words AS you speak and,
  // when it produces a solid transcript, is used directly (faster than uploading audio)
  const recogRef = useRef<any>(null)
  const liveTextRef = useRef('')
  const [liveText, setLiveText] = useState('')
  const lastHeardRef = useRef('') // your last question — stays on screen while Thinking
  const voiceBgRef = useRef<HTMLDivElement | null>(null) // reactive dotted background (mic level → CSS var)
  const audioElRef = useRef<HTMLAudioElement | null>(null) // plays the natural (Gemini) voice
  const speakSeqRef = useRef(0) // invalidates an in-flight speech chain when stopped/superseded
  const playCtxRef = useRef<AudioContext | null>(null) // separate context for streamed TTS playback
  const playCursorRef = useRef(0) // scheduling cursor so streamed PCM chunks play gaplessly
  const liveWsRef = useRef<WebSocket | null>(null) // active Gemini Live socket (streamed voice)

  const SPEAK_THRESHOLD = 0.035        // RMS level that counts as "you're talking"
  const SILENCE_HANG_MS = 1200         // stop the segment after this much quiet following speech
  const NO_SPEECH_TIMEOUT_MS = 6000    // give up a segment if nothing is heard at all
  const MAX_TOTAL_SILENCE_MS = 30000   // after this much total silence, idle to "tap to speak"

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
    setMicOK(typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia)
    try { setSpeak(localStorage.getItem('jt-chat-speak') !== 'off') } catch { /* ignore */ }
  }, [])
  useEffect(() => { try { localStorage.setItem('jt-chat-speak', speak ? 'on' : 'off') } catch { /* ignore */ } }, [speak])
  // release the mic / stop everything if the widget unmounts mid-conversation
  useEffect(() => () => {
    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current)
      if (silenceHangTimerRef.current) clearTimeout(silenceHangTimerRef.current)
      recogRef.current?.stop?.()
      mediaRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      audioCtxRef.current?.close()
      window.speechSynthesis?.cancel()
    } catch { /* ignore */ }
  }, [])

  const stopSpeaking = () => {
    speakSeqRef.current++ // cancels any in-flight streamed-chunk chain
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    try { if (audioElRef.current) { audioElRef.current.onended = null; audioElRef.current.pause() } } catch { /* ignore */ }
    try { if (liveWsRef.current) { liveWsRef.current.onclose = null; liveWsRef.current.close() } } catch { /* ignore */ }
    liveWsRef.current = null
    playCursorRef.current = 0
    setSpeaking(false)
  }

  // iOS only lets audio play if it was first "touched" inside a real tap — call this
  // from every voice-related click so later programmatic playback works. Unlocks BOTH
  // the <audio> element (batch-WAV fallback) and the Web Audio context (streamed voice).
  const unlockAudio = () => {
    if (!audioElRef.current) {
      const a = new Audio()
      // a tiny silent wav — playing it inside the gesture unlocks the element
      a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='
      a.play().catch(() => {})
      audioElRef.current = a
    }
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!playCtxRef.current) playCtxRef.current = new AC()
      const ctx = playCtxRef.current!
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      // play one silent sample to fully unlock streamed playback on iOS
      const buf = ctx.createBuffer(1, 1, 24000)
      const src = ctx.createBufferSource()
      src.buffer = buf; src.connect(ctx.destination); src.start(0)
    } catch { /* ignore */ }
  }

  // fallback: the browser's built-in (robotic) synthesizer
  const synthSay = (text: string, onDone?: () => void) => {
    const synth = window.speechSynthesis
    if (!synth) { onDone?.(); return }
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (voiceRef.current) u.voice = voiceRef.current
    u.lang = voiceRef.current?.lang || 'en-CA'
    u.rate = 1.0; u.pitch = 1.0
    const done = () => { setSpeaking(false); onDone?.() }
    u.onend = done
    u.onerror = done
    synth.speak(u)
  }

  // Split into speakable chunks so the first sentence can start playing while the
  // rest are still being generated — this kills the "waits for the whole answer" delay.
  const chunkForSpeech = (t: string): string[] => {
    const parts = t.match(/[^.!?\n]+[.!?]*\s*/g) || [t]
    const out: string[] = []
    let buf = ''
    for (const p of parts) {
      buf += p
      if (buf.trim().length >= 60) { out.push(buf.trim()); buf = '' } // batch tiny sentences
    }
    if (buf.trim()) out.push(buf.trim())
    return out.length ? out : [t]
  }

  // fetch one chunk's WAV as a data: URL (null → let caller fall back)
  const fetchTts = async (text: string): Promise<string | null> => {
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const d = await r.json()
      if (!r.ok || !d.audio) return null
      return `data:${d.mime || 'audio/wav'};base64,${d.audio}`
    } catch { return null }
  }

  // BATCH fallback — natural Gemini voice via the (slow ~20s) non-streaming TTS model,
  // sentence-chunked so the first sentence starts before the rest finish. Used only if
  // the streaming Live path fails.
  const sayBatch = (t: string, onDone?: () => void, seq?: number) => {
    const mySeq = seq ?? speakSeqRef.current
    const alive = () => speakSeqRef.current === mySeq
    const chunks = chunkForSpeech(t)
    const jobs = chunks.map((c) => fetchTts(c)) // parallel generation
    const a = audioElRef.current || new Audio()
    audioElRef.current = a
    const playFrom = async (i: number) => {
      if (!alive()) return
      if (i >= jobs.length) { setSpeaking(false); onDone?.(); return }
      const url = await jobs[i]
      if (!alive()) return
      if (!url) { synthSay(chunks.slice(i).join(' '), () => { if (alive()) { setSpeaking(false); onDone?.() } }); return }
      a.src = url
      a.onended = () => playFrom(i + 1)
      a.onerror = () => playFrom(i + 1)
      a.play().catch(() => { if (alive()) synthSay(chunks.slice(i).join(' '), () => { if (alive()) { setSpeaking(false); onDone?.() } }) })
    }
    playFrom(0)
  }

  // schedule one PCM (16-bit, 24kHz mono) chunk to play right after the previous one
  const playPcmChunk = (b64: string) => {
    const ctx = playCtxRef.current
    if (!ctx) return
    try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const pcm = new Int16Array(bytes.buffer)
    if (!pcm.length) return
    const buf = ctx.createBuffer(1, pcm.length, 24000)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768 // Int16 → Float32
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const startAt = Math.max(ctx.currentTime + 0.02, playCursorRef.current)
    src.start(startAt)
    playCursorRef.current = startAt + buf.duration
    } catch { /* a bad chunk shouldn't break the stream */ }
  }

  // STREAMING natural voice via the Gemini Live API — audio streams AS it's generated,
  // so speech starts in ~1s instead of waiting ~20s for the whole clip. Falls back to
  // sayBatch (then the browser voice) if anything goes wrong.
  const sayLive = (t: string, onDone?: () => void) => {
    const seq = ++speakSeqRef.current
    const alive = () => speakSeqRef.current === seq
    const ctx = playCtxRef.current
    if (!ctx || typeof WebSocket === 'undefined') { sayBatch(t, onDone, seq); return }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    playCursorRef.current = 0

    let started = false          // has any audio arrived?
    let settled = false          // has this turn finished/failed?
    const fail = () => { if (settled) return; settled = true; if (alive()) sayBatch(t, onDone, seq) }
    const finish = () => {
      if (settled) return; settled = true
      if (!alive()) return
      // wait for the already-scheduled audio to finish, then relisten
      const remaining = Math.max(0, (playCursorRef.current - ctx.currentTime) * 1000)
      setTimeout(() => { if (alive()) { setSpeaking(false); onDone?.() } }, remaining + 120)
    }

    ;(async () => {
      let token: string, MODEL: string
      try {
        const r = await fetch('/api/live-token', { method: 'POST' })
        const d = await r.json()
        if (!r.ok || !d.token) throw new Error(d.detail || d.error || ('token http ' + r.status))
        token = d.token
        MODEL = d.model || 'models/gemini-3.1-flash-live-preview' // server is the source of truth
      } catch { fail(); return }
      if (!alive()) return

      // Ephemeral tokens are v1beta-only, use the DEDICATED "Constrained" bidi method, and
      // authenticate via the access_token query param (the plain BidiGenerateContent method
      // and the `key` param both reject ephemeral tokens).
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`
      let ws: WebSocket
      try { ws = new WebSocket(url) } catch { fail(); return }
      liveWsRef.current = ws
      const watchdog = setTimeout(() => { if (!started) { try { ws.close() } catch { /* ignore */ } ; fail() } }, 8000)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          setup: {
            model: MODEL,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
            },
            systemInstruction: { parts: [{ text: 'You are a text-to-speech engine. Speak the user message aloud verbatim in a warm, natural tone. Do not add, answer, summarize, or comment — only voice the exact words given.' }] },
          },
        }))
      }
      ws.onmessage = async (ev) => {
        try {
          const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text()
          const msg = JSON.parse(raw)
          if (msg.setupComplete) {
            ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: t }] }], turnComplete: true } }))
            return
          }
          const parts = msg.serverContent?.modelTurn?.parts || []
          for (const p of parts) {
            const data = p.inlineData?.data
            if (data && alive()) { started = true; clearTimeout(watchdog); playPcmChunk(data) }
          }
          if (msg.serverContent?.turnComplete || msg.serverContent?.generationComplete) {
            clearTimeout(watchdog)
            try { ws.close() } catch { /* ignore */ }
          }
        } catch { /* ignore malformed frames */ }
      }
      ws.onerror = () => { clearTimeout(watchdog); if (!started) fail() }
      ws.onclose = () => { clearTimeout(watchdog); if (liveWsRef.current === ws) liveWsRef.current = null; started ? finish() : fail() }
    })()
  }

  // Text-to-speech dispatcher — natural STREAMING Live voice first (fast), with the
  // batch Gemini voice and finally the browser voice as automatic fallbacks.
  const say = (text: string, onDone?: () => void) => {
    const t = plain(text)
    if (!t) { onDone?.(); return } // voice mode always speaks; chat mode never calls say()
    setSpeaking(true)
    sayLive(t, onDone)
  }

  // ── unified voice engine — same recording/silence/transcribe pipeline everywhere ──
  const clearVoiceTimers = () => {
    if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current)
    if (silenceHangTimerRef.current) clearTimeout(silenceHangTimerRef.current)
    noSpeechTimerRef.current = null; silenceHangTimerRef.current = null
  }

  const ensureAudioGraph = (stream: MediaStream) => {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!audioCtxRef.current) audioCtxRef.current = new AC()
    const ctx = audioCtxRef.current!
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser) // never connect to destination — no playback/feedback
    analyserRef.current = analyser
    dataArrRef.current = new Uint8Array(analyser.frequencyBinCount)
  }

  // polls the mic level; auto-stops the segment after a hang of silence following speech
  const monitorLoop = () => {
    const analyser = analyserRef.current, arr = dataArrRef.current
    if (analyser && arr) {
      analyser.getByteTimeDomainData(arr as Uint8Array<ArrayBuffer>)
      let sum = 0
      for (let i = 0; i < arr.length; i++) { const v = (arr[i] - 128) / 128; sum += v * v }
      const rms = Math.sqrt(sum / arr.length)
      // drive the reactive dotted background — normalize RMS to a 0..1-ish level
      if (voiceBgRef.current) voiceBgRef.current.style.setProperty('--vlevel', Math.min(1, rms * 9).toFixed(3))
      if (rms > SPEAK_THRESHOLD) {
        if (!speechDetectedRef.current) { speechDetectedRef.current = true; if (noSpeechTimerRef.current) { clearTimeout(noSpeechTimerRef.current); noSpeechTimerRef.current = null } }
        if (silenceHangTimerRef.current) clearTimeout(silenceHangTimerRef.current)
        silenceHangTimerRef.current = setTimeout(() => finishSegment(), SILENCE_HANG_MS)
      }
    }
    rafRef.current = requestAnimationFrame(monitorLoop)
  }

  // best-effort live captions via SpeechRecognition — shows your words AS you speak.
  // Where it works (desktop/Android Chrome) its transcript is also used directly, which
  // is faster than uploading audio. Where it's blocked (iOS) the recorder still covers us.
  const startLiveCaptions = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    try {
      const r = new SR()
      r.lang = 'en-CA'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1
      let finals = ''
      r.onresult = (e: any) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i]
          if (res.isFinal) finals += res[0].transcript; else interim += res[0].transcript
        }
        const t = (finals + ' ' + interim).replace(/\s+/g, ' ').trim()
        liveTextRef.current = t
        setLiveText(t)
      }
      r.onerror = () => { /* captions are optional — the recorder is the source of truth */ }
      recogRef.current = r
      r.start()
    } catch { /* ignore */ }
  }
  const stopLiveCaptions = () => { try { recogRef.current?.stop?.() } catch { /* ignore */ } recogRef.current = null }

  // begin one recording "turn" on the already-open stream (no new permission needed)
  const beginSegment = () => {
    const stream = streamRef.current
    if (!stream || !voiceModeRef.current) return
    setVoiceError('')
    speechDetectedRef.current = false
    chunksRef.current = []
    liveTextRef.current = ''; setLiveText('')
    let mr: MediaRecorder
    try {
      const mime = ['audio/webm', 'audio/mp4', 'audio/aac'].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || ''
      mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    } catch (e: any) { setVoiceError('Could not start the recorder: ' + (e?.message || e)); return }
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
    mr.onstop = () => handleSegmentStop(mr.mimeType)
    mediaRef.current = mr
    setListening(true)
    mr.start()
    startLiveCaptions()
    clearVoiceTimers()
    noSpeechTimerRef.current = setTimeout(() => finishSegment(), NO_SPEECH_TIMEOUT_MS)
    if (!rafRef.current) rafRef.current = requestAnimationFrame(monitorLoop)
  }
  beginSegmentRef.current = beginSegment

  const finishSegment = () => {
    clearVoiceTimers()
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    stopLiveCaptions()
    try { if (mediaRef.current?.state === 'recording') mediaRef.current.stop() } catch { /* ignore */ }
  }

  // a segment ended — either send what was heard, retry, or (after enough total silence) end the call
  const handleSegmentStop = async (mimeType: string) => {
    setListening(false)
    const hadSpeech = speechDetectedRef.current
    const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
    if (!hadSpeech || !blob.size) {
      silentAccumRef.current += NO_SPEECH_TIMEOUT_MS
      // ~30s of silence → stop listening and idle to "tap to speak" (stay in voice mode, don't close)
      if (silentAccumRef.current >= MAX_TOTAL_SILENCE_MS) { finishSegment(); setListening(false); return }
      if (voiceModeRef.current) beginSegmentRef.current()
      return
    }
    silentAccumRef.current = 0 // real speech happened — reset the inactivity clock

    // fast path: the live captions already produced the transcript — use it directly
    const live = liveTextRef.current.trim()
    if (live.length >= 2) {
      lastHeardRef.current = live // keep the question on screen while Thinking
      setInput(''); sendRef.current(live)
      return
    }

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
      setBusy(false)
      if (!r.ok) { setVoiceError(d.error || 'Transcription failed.'); if (voiceModeRef.current) beginSegmentRef.current(); return }
      const text = (d.text || '').trim()
      if (text) { lastHeardRef.current = text; setLiveText(text); setInput(''); sendRef.current(text) } // send() speaks the reply, then resumes listening
      else { setVoiceError("Didn't catch that — try again."); if (voiceModeRef.current) beginSegmentRef.current() }
    } catch (e: any) {
      setBusy(false); setVoiceError('Transcription failed: ' + (e?.message || e))
      if (voiceModeRef.current) beginSegmentRef.current()
    }
  }

  // first tap: acquire the mic (must be called directly from the click — no await before it)
  const openVoiceStream = () => {
    setVoiceError('')
    if (!navigator.mediaDevices?.getUserMedia) { setVoiceError('This browser has no microphone access API.'); return }
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      streamRef.current = stream
      try { ensureAudioGraph(stream) } catch (e: any) { setVoiceError('Audio setup failed: ' + (e?.message || e)); return }
      silentAccumRef.current = 0
      beginSegment()
    }).catch((e: any) => {
      setVoiceError(
        e?.name === 'NotAllowedError' ? 'Microphone access denied. Enable it in Settings → Safari → Microphone (or the site permissions) and try again.'
        : e?.name === 'NotFoundError' ? 'No microphone was found on this device.'
        : `Microphone error: ${e?.name || ''} ${e?.message || e}`.trim()
      )
    })
  }

  // orb / center-mic tap: stop early if listening, else start (opening the stream on first use)
  const onTalk = () => {
    setVoiceError('')
    unlockAudio() // inside the tap — lets the natural voice play later on iOS
    stopSpeaking()
    if (listening) { finishSegment(); return }
    if (!streamRef.current) { openVoiceStream(); return }
    beginSegment()
  }

  // fully tear down the mic/audio graph. fullClose also dismisses the whole chat widget
  // (used only for the 30–40s inactivity timeout); manual end just returns to text chat.
  const endVoiceConversation = (fullClose: boolean) => {
    clearVoiceTimers()
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    stopLiveCaptions()
    liveTextRef.current = ''; setLiveText(''); lastHeardRef.current = ''
    try { mediaRef.current?.stop() } catch { /* ignore */ }
    mediaRef.current = null
    try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
    streamRef.current = null
    analyserRef.current = null
    silentAccumRef.current = 0
    stopSpeaking()
    setListening(false)
    setVoiceMode(false); voiceModeRef.current = false
    setVoiceError('')
    if (fullClose) onClose()
  }

  // mode pill: Chat ⇄ Voice. Entering Voice auto-starts listening (no extra tap needed).
  const toggleVoice = () => {
    if (!micOK) return
    if (voiceMode) { endVoiceConversation(false); return } // Voice → Chat (stops mic + any speech)
    setVoiceError(''); unlockAudio(); stopSpeaking()
    setVoiceMode(true); voiceModeRef.current = true
    silentAccumRef.current = 0
    openVoiceStream() // acquire mic + begin listening immediately (still inside the tap gesture)
  }

  // X button: close the whole widget from either mode, interrupting anything in flight
  // (AI speaking, listening, thinking).
  const closeAll = () => {
    stopSpeaking()
    endVoiceConversation(false) // tears down mic/audio; no-op cost if already in chat mode
    onClose()
  }

  // copy a chat bubble's text — called from the Copy button (a real tap → clipboard allowed)
  const copyMsg = (text: string, i: number) => {
    const flash = () => { setActionIdx(null); setCopiedIdx(i); setTimeout(() => setCopiedIdx((c) => (c === i ? null : c)), 1400) }
    try {
      if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(flash).catch(() => fallbackCopy(text, flash)) }
      else fallbackCopy(text, flash)
    } catch { fallbackCopy(text, flash) }
  }
  const fallbackCopy = (text: string, flash: () => void) => {
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.readOnly = false
      ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.setSelectionRange(0, text.length)
      document.execCommand('copy'); ta.remove()
    } catch { /* ignore */ }
    flash()
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
      // hands-free: auto-listen again after the answer speaks (reuses the open mic stream)
      const resume = () => { if (voiceModeRef.current) beginSegmentRef.current() }
      if (data.actions?.length) {
        setPending(data.actions)
        // confirm inside the current mode — speak the prompt if in voice
        if (voiceModeRef.current) say(data.actions.length === 1 ? `${data.actions[0].label}. Confirm or cancel?` : `${data.actions.length} changes. Confirm or cancel?`)
      } else {
        const reply = data.reply || data.error || 'Something went wrong.'
        setMsgs([...next, { role: 'assistant', content: reply, at: Date.now() }])
        // only speak in voice mode — chat mode is text-only, never triggers the voice
        if (voiceModeRef.current && data.reply) say(reply, resume); else resume()
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
    if (voiceModeRef.current) say(okCount ? `Done. ${okCount} change${okCount !== 1 ? 's' : ''} saved.` : summary, () => { if (voiceModeRef.current) beginSegmentRef.current() })
  }

  const cancelAction = () => {
    setMsgs((m) => [...m, { role: 'assistant', content: 'Okay, cancelled — nothing was saved.', at: Date.now() }])
    setPending(null)
    if (voiceModeRef.current) say('Cancelled.', () => { if (voiceModeRef.current) beginSegmentRef.current() })
  }

  const recents = [...threads].sort((a, b) => b.updatedAt - a.updatedAt)

  const roundBtn: React.CSSProperties = { width: 38, height: 38, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-primary)', cursor: 'pointer' }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card glass" onClick={(e) => { e.stopPropagation(); setRecentOpen(false) }}
        style={{ width: 'min(720px, 100%)', height: 'min(88vh, 760px)', maxHeight: '88vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface-1)', position: 'relative' }}>

        {/* Header — X (close/interrupt) · Chat|Voice pill · history + new chat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <button style={roundBtn} aria-label="Close" title="Close" onClick={closeAll}><X size={20} /></button>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
            <div className="mode-pill" role="tablist" aria-label="Chat or voice mode">
              <button role="tab" aria-selected={!voiceMode} className={`mode-seg ${!voiceMode ? 'is-active' : ''}`}
                onClick={() => { if (voiceMode) toggleVoice() }}><MessageSquare size={15} /> Chat</button>
              <button role="tab" aria-selected={voiceMode} disabled={!micOK} title={micOK ? '' : 'Microphone unavailable'}
                className={`mode-seg ${voiceMode ? 'is-active' : ''}`}
                onClick={() => { if (!voiceMode) toggleVoice() }}><AudioLines size={15} /> Voice</button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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

        {voiceMode ? (
          /* ── VOICE MODE — animated dotted canvas, tap the center to speak ── */
          <div ref={voiceBgRef}
            className={`voice-body ${pending ? 'is-idle' : listening ? 'is-listening' : busy ? 'is-thinking' : speaking ? 'is-speaking' : 'is-idle'}`}>
            <div className="voice-dots" aria-hidden />
            <div className="voice-body-inner">
              <button type="button" className="voice-viz" aria-label="Tap to speak" onClick={onTalk}>
                <span /><span /><span /><span /><span />
              </button>
              {pending ? (
                <>
                  <div className="voice-status" style={{ color: 'var(--accent)' }}>Confirm {pending.length > 1 ? `${pending.length} changes` : 'this change'}</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, maxWidth: 460, width: '100%' }}>
                    {pending.map((p, i) => (
                      <li key={i} style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>{p.label}</li>
                    ))}
                  </ul>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button className="btn" onClick={cancelAction} disabled={busy} style={{ background: 'var(--kpi-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '11px 20px' }}><X size={16} /> Cancel</button>
                    <button className="btn btn-primary" onClick={confirmAction} disabled={busy} style={{ padding: '11px 24px', gap: 6 }}><Check size={16} /> Confirm</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="voice-status" style={{ color: voiceError ? 'var(--expense)' : listening ? 'var(--expense)' : 'var(--accent)' }}>
                    {voiceError ? 'Mic error' : listening ? 'Listening' : busy ? 'Thinking' : speaking ? 'Speaking' : 'Tap to speak'}
                  </div>
                  <div className="voice-caption">
                    {voiceError
                      ? voiceError
                      : listening
                        ? (liveText || <span style={{ color: 'var(--text-muted)' }}>Say something…</span>)
                        : busy
                          ? (lastHeardRef.current ? <span style={{ color: 'var(--text-secondary)' }}>“{lastHeardRef.current}”</span> : <span style={{ color: 'var(--text-muted)' }}>…</span>)
                          : ([...msgs].reverse().find((m) => m.role === 'assistant')?.content || <span style={{ color: 'var(--text-muted)' }}>Tap the center to speak.</span>)}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
        <>
        {/* Messages (the only part that scrolls) */}
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.at && <div style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 6px' }}>{timeOf(m.at)}</div>}
              <div
                onTouchStart={() => { copyTimer.current = setTimeout(() => setActionIdx(i), 450) }}
                onTouchEnd={() => { if (copyTimer.current) clearTimeout(copyTimer.current) }}
                onTouchMove={() => { if (copyTimer.current) clearTimeout(copyTimer.current) }}
                onContextMenu={(e) => { e.preventDefault(); setActionIdx(i) }}
                title="Hold for options"
                style={{
                  maxWidth: '86%', padding: '11px 14px', borderRadius: 18, fontSize: 14, lineHeight: 1.5, cursor: 'pointer',
                  whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--kpi-bg)',
                  color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                  borderBottomRightRadius: m.role === 'user' ? 6 : 18,
                  borderBottomLeftRadius: m.role === 'user' ? 18 : 6,
                }}>{m.role === 'user' ? m.content : <Markdown text={m.content} />}</div>
              {actionIdx === i && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="chip" onClick={(e) => { e.stopPropagation(); copyMsg(m.content, i) }} style={{ padding: '5px 12px', fontSize: 12 }}>Copy</button>
                  <button className="chip" onClick={(e) => { e.stopPropagation(); unlockAudio(); stopSpeaking(); say(m.content); setActionIdx(null) }} style={{ padding: '5px 12px', fontSize: 12 }}>Read aloud</button>
                </div>
              )}
              {copiedIdx === i && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--income)', marginTop: 3 }}>Copied ✓</div>}
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
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
              style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 999, border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: input.trim() ? 'var(--accent)' : 'var(--border)', color: '#fff', opacity: busy ? 0.6 : 1 }}>
              <ArrowUp size={20} />
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 7 }}>Gemini can make mistakes — double-check important numbers.</div>
        </form>
        </>
        )}
      </div>
    </div>,
    document.body,
  )
}

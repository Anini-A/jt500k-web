'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, ClipboardPaste, PencilLine, Repeat, Settings2, ImagePlus, RotateCcw, X } from 'lucide-react'
import CategorySelect from './CategorySelect'
import IconPill from './IconPill'
import { getJSON } from '@/lib/fresh'
import { ymd, today } from '@/lib/date'

interface Category { name: string; type: string }
interface Card { id: string; name: string }
interface Row { date: string; description: string; category: string; type: string; amount: string; card?: string }
interface Draft { id: string; name: string | null; rows: Row[]; updated_at: string }

const inp: React.CSSProperties = {
  height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}
const cell: React.CSSProperties = { ...inp, height: 38, padding: '0 8px', fontSize: 13, minWidth: 0 }

// Old sheet names → current category names (user still copies from the old sheet)
const ALIASES: Record<string, string> = {
  'transpo': 'Transportation', 'perso': 'Personal', 'subs': 'Subscriptions',
  'entmt': 'Entertainment', 'edu': 'Education', 'hf fun m': 'Fun Money',
  'ja fun m': 'Fun Money', 'hf fun money': 'Fun Money', 'ja fun money': 'Fun Money',
  'baby exp': 'Baby',
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const rowValid = (r: Row) => isDate(r.date) && !!r.category && !isNaN(parseFloat(r.amount)) && parseFloat(r.amount) > 0

function normalizeDate(s: string): string {
  s = (s || '').trim()
  if (isDate(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : ymd(d)
}

function parsePaste(raw: string, cats: Category[]): Row[] {
  const byLower = new Map(cats.map((c) => [c.name.toLowerCase(), c]))
  const out: Row[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/)
    const [d = '', desc = '', catRaw = '', amtRaw = ''] = parts.map((p) => p.trim())
    if (/^date$/i.test(d)) continue // header row
    const amt = parseFloat((amtRaw || '').replace(/[^0-9.\-]/g, ''))
    let category = '', type = 'expense', description = desc
    if (catRaw) {
      const aliased = ALIASES[catRaw.toLowerCase()] || catRaw
      const m = byLower.get(aliased.toLowerCase())
      if (m) { category = m.name; type = m.type }
    }
    // Fun Money is one category now — keep the HF/JA distinction in the description
    if (category === 'Fun Money') {
      const who = /^hf/i.test(catRaw) ? 'HF' : /^ja/i.test(catRaw) ? 'JA' : ''
      if (who && !/\b(hf|ja)\b/i.test(description)) description = description ? `${who} ${description}` : `${who} Fun money`
    }
    out.push({ date: normalizeDate(d), description, category, type, amount: isNaN(amt) ? '' : String(amt) })
  }
  return out
}

// Header "Add Transaction" pill that opens a modal. Works on any page.
// trigger=false → headless (no button), opens only via the 'open-add-import' event.
export default function AddTransactionButton({ trigger = true }: { trigger?: boolean }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'single' | 'batch' | 'recurring'>('single')
  const [saving, setSaving] = useState(false)
  const [cats, setCats] = useState<Category[]>([])
  const [debts, setDebts] = useState<{ name: string }[]>([])
  const [form, setForm] = useState({
    date: today(), type: 'expense', category: '', amount: '', description: '',
  })
  const [singleErr, setSingleErr] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [saved, setSaved] = useState<null | { amount: number; category: string; type: string }>(null) // Quick: success screen
  const [dateOpen, setDateOpen] = useState(false) // Quick: reveal the date field (defaults to today)
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  // ── Smart Import (AI paste + per-card totals + saved drafts) ──
  const [cards, setCards] = useState<Card[]>([])
  const [selectedCard, setSelectedCard] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [draftId, setDraftId] = useState<string | null>(null) // the draft currently being edited
  const [pasteOpen, setPasteOpen] = useState(true)            // is the paste input showing
  const [manageCardsOpen, setManageCardsOpen] = useState(false)
  const [newCard, setNewCard] = useState('')      // inline add-card input
  const [flash, setFlash] = useState('')          // inline success message (replaces alert)
  const [confirmDel, setConfirmDel] = useState<null | { kind: 'card' | 'draft' | 'rec'; id: string; name?: string }>(null)
  const [recErr, setRecErr] = useState('')
  const [manageRec, setManageRec] = useState(false) // Recurring: default is tick-and-log; management is behind this
  const [parsing, setParsing] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [importErr, setImportErr] = useState('')
  const [images, setImages] = useState<{ id: string; data: string; mime: string; preview: string }[]>([])
  const [recs, setRecs] = useState<any[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [recDate, setRecDate] = useState(today())
  const [recEdit, setRecEdit] = useState<null | 'new' | string>(null) // manage recurring items
  const [recForm, setRecForm] = useState({ name: '', type: 'expense', category: '', amount: '', description: '' })

  useEffect(() => {
    if (open && cats.length === 0) {
      getJSON('/api/categories').then((d) => Array.isArray(d) && setCats(d)).catch(() => {})
      getJSON('/api/debts').then((d) => Array.isArray(d) && setDebts(d)).catch(() => {})
    }
  }, [open, cats.length])

  useEffect(() => {
    if (open && mode === 'recurring' && recs.length === 0) {
      getJSON('/api/recurring').then((d) => {
        if (Array.isArray(d)) { setRecs(d.filter((r: any) => r.active)); setPicked(new Set()) }
      }).catch(() => {})
    }
  }, [open, mode, recs.length])

  // Import tab: load the card list + saved drafts
  const loadCards = useCallback(() => getJSON('/api/cards').then((d) => Array.isArray(d) && setCards(d)).catch(() => {}), [])
  const loadDrafts = useCallback(() => getJSON('/api/drafts').then((d) => Array.isArray(d) && setDrafts(d)).catch(() => {}), [])
  useEffect(() => { if (open && mode === 'batch') { loadCards(); loadDrafts() } }, [open, mode, loadCards, loadDrafts])
  // the headless instance responds to app-wide open events (Home "To log" card,
  // the long-press Settings shortcut). Visible instances only open on their button.
  useEffect(() => {
    if (trigger) return
    const openImport = () => { setMode('batch'); setOpen(true) }
    const openAdd = () => { setMode('single'); setOpen(true) }
    window.addEventListener('open-add-import', openImport)
    window.addEventListener('open-add-transaction', openAdd)
    return () => { window.removeEventListener('open-add-import', openImport); window.removeEventListener('open-add-transaction', openAdd) }
  }, [trigger])
  // default the card picker to the first card once loaded
  useEffect(() => { if (!selectedCard && cards.length) setSelectedCard(cards[0].name) }, [cards, selectedCard])

  const close = () => {
    setOpen(false); setMode('single'); setRaw(''); setRows([]); setImages([])
    setDraftId(null); setPasteOpen(true); setImportErr(''); setSaved(null); setSingleErr('')
    setManageRec(false); setRecEdit(null); setRecErr('')
    setForm({ date: today(), type: 'expense', category: '', amount: '', description: '' })
  }

  // Reset the whole card WITHOUT closing it — clears every mode's working state, keeps the tab you're on.
  const resetAll = () => {
    setForm({ date: today(), type: 'expense', category: '', amount: '', description: '' })
    setRaw(''); setRows([]); setImages([]); setDraftId(null); setPasteOpen(true); setImportErr(''); setManageCardsOpen(false)
    setPicked(new Set()); setRecEdit(null); setRecDate(today())
    setRecForm({ name: '', type: 'expense', category: '', amount: '', description: '' })
  }

  const logRecurring = async () => {
    const chosen = recs.filter((r) => picked.has(r.id))
    if (!chosen.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chosen.map((r) => ({ date: recDate, type: r.type, category: r.category, amount: Number(r.amount), description: r.description || r.name }))),
      })
      if (res.ok) { close(); window.dispatchEvent(new CustomEvent('transaction-added')) }
      else setRecErr((await res.json()).error || 'Could not log.')
    } finally { setSaving(false) }
  }

  // ---- manage recurring items (add / edit / delete) ----
  const reloadRecs = async () => { const d = await getJSON('/api/recurring').catch(() => []); if (Array.isArray(d)) setRecs(d.filter((r: any) => r.active)) }
  const startNewRec = () => { setRecForm({ name: '', type: 'expense', category: '', amount: '', description: '' }); setRecEdit('new') }
  const startEditRec = (r: any) => { setRecForm({ name: r.name, type: r.type, category: r.category, amount: String(r.amount), description: r.description || '' }); setRecEdit(r.id) }
  const saveRec = async () => {
    const amount = parseFloat(recForm.amount)
    if (!recForm.name.trim() || !recForm.category || !(amount > 0)) { setRecErr('Name, category and a positive amount are required.'); return }
    const payload = { name: recForm.name.trim(), type: recForm.type, category: recForm.category, amount, description: recForm.description }
    setSaving(true)
    try {
      const res = recEdit === 'new'
        ? await fetch('/api/recurring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/recurring', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: recEdit, ...payload }) })
      if (res.ok) { setRecEdit(null); setRecErr(''); await reloadRecs() } else setRecErr((await res.json()).error || 'Could not save.')
    } finally { setSaving(false) }
  }
  const deleteRec = () => { if (recEdit && recEdit !== 'new') setConfirmDel({ kind: 'rec', id: recEdit, name: 'this recurring item' }) }

  const submitSingle = async (again: boolean) => {
    setSingleErr('')
    const amt = parseFloat(form.amount)
    if (!(amt > 0)) { setSingleErr('Enter an amount.'); return }
    if (!form.category) { setSingleErr('Pick a category.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: amt }),
      })
      if (!res.ok) { setSingleErr((await res.json()).error || 'Could not save.'); return }
      window.dispatchEvent(new CustomEvent('transaction-added'))
      if (again) {
        // rapid path: keep type + date, clear the rest, flash a confirmation, stay on the form
        setForm((f) => ({ ...f, category: '', amount: '', description: '' }))
        setDateOpen(false); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1600)
      } else {
        // land on a success screen so it never just vanishes
        setSaved({ amount: amt, category: form.category, type: form.type })
      }
    } finally { setSaving(false) }
  }
  // from the success screen → log another one
  const addAnother = () => {
    setSaved(null); setSingleErr('')
    setForm((f) => ({ ...f, category: '', amount: '', description: '' })); setDateOpen(false)
  }

  const logBatch = async () => {
    const valid = (rows ?? []).filter(rowValid)
    if (!valid.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(valid.map((r) => ({
          date: r.date, description: r.description, category: r.category, type: r.type, amount: parseFloat(r.amount),
        }))),
      })
      if (!res.ok) { setImportErr((await res.json()).error || 'Could not save.'); return }
      // logged successfully → clear the draft it came from, then close
      if (draftId) await fetch(`/api/drafts?id=${draftId}`, { method: 'DELETE' }).catch(() => {})
      close(); window.dispatchEvent(new CustomEvent('transaction-added'))
    } finally { setSaving(false) }
  }

  // ── Smart Import handlers ──
  // downscale a screenshot to keep the upload small/cheap (max ~1500px, JPEG)
  const addImageFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const scale = Math.min(1, 1500 / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
        const preview = canvas.toDataURL('image/jpeg', 0.85)
        URL.revokeObjectURL(url)
        setImages((prev) => [...prev, { id: Math.random().toString(36).slice(2), data: preview.split(',')[1], mime: 'image/jpeg', preview }])
      }
      img.onerror = () => URL.revokeObjectURL(url)
      img.src = url
    }
  }
  const onPasteInput = (e: React.ClipboardEvent) => {
    const imgFiles = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean) as File[]
    if (imgFiles.length) { e.preventDefault(); addImageFiles(imgFiles) } // pasted a screenshot
  }

  const formatWithAI = async () => {
    if (!raw.trim() && images.length === 0) return
    setParsing(true); setImportErr('')
    try {
      const res = await fetch('/api/import/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw, images: images.map((i) => ({ data: i.data, mime: i.mime })), today: today() }),
      })
      const d = await res.json()
      if (!res.ok || !Array.isArray(d.rows)) { setImportErr(d.error || 'Could not read that. Try again.'); return }
      if (d.rows.length === 0) { setImportErr('No transactions found. Check the screenshot is clear, or edit manually.'); return }
      const tagged: Row[] = d.rows.map((r: any) => ({ ...r, amount: String(r.amount), card: selectedCard || undefined }))
      setRows((prev) => [...prev, ...tagged])  // append so you can paste multiple cards into one batch
      setRaw(''); setImages([]); setPasteOpen(false)
    } catch (e: any) { setImportErr('Parse failed: ' + (e?.message || e)) } finally { setParsing(false) }
  }

  const showFlash = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 1800) }
  const addCardInline = async () => {
    const name = newCard.trim(); if (!name) return
    const res = await fetch('/api/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (res.ok) { const c = await res.json(); setNewCard(''); await loadCards(); setSelectedCard(c.name) }
    else setImportErr('Could not add card.')
  }
  // one inline confirm for every destructive delete (card / draft / recurring)
  const doConfirmDel = async () => {
    if (!confirmDel) return
    const { kind, id, name } = confirmDel
    if (kind === 'card') { await fetch(`/api/cards?id=${id}`, { method: 'DELETE' }).catch(() => {}); await loadCards(); if (selectedCard === name) setSelectedCard('') }
    else if (kind === 'draft') { await fetch(`/api/drafts?id=${id}`, { method: 'DELETE' }).catch(() => {}); await loadDrafts(); window.dispatchEvent(new CustomEvent('drafts-changed')); if (draftId === id) setDraftId(null) }
    else if (kind === 'rec') { await fetch(`/api/recurring?id=${id}`, { method: 'DELETE' }).catch(() => {}); setRecEdit(null); await reloadRecs() }
    setConfirmDel(null)
  }

  const saveDraft = async () => {
    if (!rows.length) return
    setSavingDraft(true)
    try {
      const payload = { rows }
      const res = draftId
        ? await fetch('/api/drafts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draftId, ...payload }) })
        : await fetch('/api/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { setImportErr('Could not save draft.'); return }
      const d = await res.json(); setDraftId(d.id); await loadDrafts(); window.dispatchEvent(new CustomEvent("drafts-changed"))
      setImportErr(''); showFlash('Draft saved')
    } finally { setSavingDraft(false) }
  }
  // append the current rows onto an existing draft, then clear the working area
  const appendToDraft = async (dr: Draft) => {
    if (!rows.length) return
    setSavingDraft(true)
    try {
      const merged = [...(dr.rows || []).map((r) => ({ ...r, amount: String(r.amount) })), ...rows]
      const res = await fetch('/api/drafts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: dr.id, rows: merged }) })
      if (!res.ok) { setImportErr('Could not save to that draft.'); return }
      await loadDrafts(); window.dispatchEvent(new CustomEvent("drafts-changed"))
      setRows([]); setDraftId(null); setPasteOpen(true); setImportErr('')
      showFlash('Added to draft')
    } finally { setSavingDraft(false) }
  }
  // start a fresh, independent batch (e.g. save card 1 as a draft, then log card 2 on its own)
  const newBatch = () => {
    if (rows.length && !draftId && !confirm('Start a fresh batch? Rows not saved as a draft will be lost.')) return
    setRows([]); setDraftId(null); setRaw(''); setImages([]); setImportErr(''); setPasteOpen(true)
  }
  const openDraft = (dr: Draft) => {
    setRows((dr.rows || []).map((r) => ({ ...r, amount: String(r.amount) })))
    setDraftId(dr.id); setPasteOpen(false); setImportErr('')
  }
  const deleteDraft = (id: string) => setConfirmDel({ kind: 'draft', id, name: 'this draft' })

  const catsForType = cats.filter((c) => c.type === form.type)
  const grouped = { income: cats.filter((c) => c.type === 'income'), expense: cats.filter((c) => c.type === 'expense'), savings: cats.filter((c) => c.type === 'savings') }
  const validCount = (rows ?? []).filter(rowValid).length
  const invalidCount = (rows ?? []).length - validCount
  // per-card subtotals for the review grid
  const cardTotals = (() => {
    const m = new Map<string, number>()
    for (const r of rows) { const amt = parseFloat(r.amount); if (!isNaN(amt)) m.set(r.card || 'Unassigned', (m.get(r.card || 'Unassigned') || 0) + amt) }
    return [...m.entries()]
  })()
  const grandTotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)

  // Recurring: group into the same buckets as the Budget tab
  const recGroup = (r: any) => r.type === 'income' ? 'income' : r.type === 'savings' ? 'saving' : r.category === 'Debt Repayment' ? 'debt' : 'spending'
  const REC_GROUPS = [
    { key: 'income', label: 'Income', color: 'var(--income)', soft: 'var(--income-soft)' },
    { key: 'spending', label: 'Spending', color: 'var(--savings)', soft: 'var(--savings-soft)' },
    { key: 'saving', label: 'Saving', color: 'var(--savings)', soft: 'var(--savings-soft)' },
    { key: 'debt', label: 'Debt', color: '#c2892f', soft: 'rgba(224,161,43,0.16)' },
  ]
  const recGroupsPresent = REC_GROUPS.filter((g) => recs.some((r) => recGroup(r) === g.key))
  const pickedTotal = recs.filter((r) => picked.has(r.id)).reduce((s, r) => s + Number(r.amount), 0)
  const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))


  return (
    <>
      {trigger && <IconPill icon={<Plus />} label="Add transaction" onClick={() => setOpen(true)} />}

      {open && createPortal(
        <div className="modal-backdrop" onClick={close}>
          <div className="modal-card glass" style={{ width: 'min(820px, 100%)', background: 'var(--surface-1)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><Plus size={18} /> Add Transaction</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {mode !== 'single' && (
                    <button type="button" onClick={resetAll} title="Reset this card" aria-label="Reset"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 34, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                      <RotateCcw size={14} /> Reset
                    </button>
                  )}
                  <button type="button" className="modal-x" onClick={close} title="Close" aria-label="Close"><X size={17} /></button>
                </div>
              </div>
              <div className="tabs" style={{ padding: 3, marginTop: 12 }}>
                <button className={`tab ${mode === 'single' ? 'tab-active' : ''}`} style={{ flex: 1, justifyContent: 'center', padding: '7px 8px', fontSize: 13 }} onClick={() => setMode('single')}>
                  <PencilLine size={14} /> Quick
                </button>
                <button className={`tab ${mode === 'batch' ? 'tab-active' : ''}`} style={{ flex: 1, justifyContent: 'center', padding: '7px 8px', fontSize: 13 }} onClick={() => setMode('batch')}>
                  <ClipboardPaste size={14} /> Import
                </button>
                <button className={`tab ${mode === 'recurring' ? 'tab-active' : ''}`} style={{ flex: 1, justifyContent: 'center', padding: '7px 8px', fontSize: 13 }} onClick={() => setMode('recurring')}>
                  <Repeat size={14} /> Recurring
                </button>
              </div>
            </div>

            {/* ---------------- QUICK (amount-first single capture) ---------------- */}
            {mode === 'single' && (() => {
              const typeColor = form.type === 'income' ? 'var(--income)' : form.type === 'savings' ? 'var(--savings)' : 'var(--expense)'
              const TYPES = [{ k: 'expense', label: 'Expense' }, { k: 'income', label: 'Income' }, { k: 'savings', label: 'Savings' }] as const
              const dateLabel = form.date === today() ? 'Today' : new Date(form.date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
              if (saved) {
                const sc = saved.type === 'income' ? 'var(--income)' : saved.type === 'savings' ? 'var(--savings)' : 'var(--expense)'
                return (
                  <div style={{ display: 'grid', gap: 18, justifyItems: 'center', textAlign: 'center', padding: '18px 0 6px' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--income-soft)', color: 'var(--income)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700 }}>✓</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-secondary)' }}>Saved</div>
                      <div style={{ fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', marginTop: 4, color: sc }}>{money(saved.amount)}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{saved.category}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                      <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={addAnother}><Plus size={15} /> Add another</button>
                      <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={close}>Done</button>
                    </div>
                  </div>
                )
              }
              return (
                <form onSubmit={(e) => { e.preventDefault(); submitSingle(false) }} style={{ display: 'grid', gap: 16 }}>
                  {/* amount hero */}
                  <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, maxWidth: '100%' }}>
                      <span style={{ fontSize: 30, fontWeight: 700, color: form.amount ? typeColor : 'var(--text-muted)' }}>$</span>
                      <input autoFocus inputMode="decimal" value={form.amount} placeholder="0.00"
                        onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })}
                        style={{ fontSize: 'clamp(40px, 12vw, 54px)', fontWeight: 800, letterSpacing: '-0.03em', border: 'none', background: 'transparent', textAlign: 'left', outline: 'none', color: typeColor, fontFamily: 'inherit', width: `${Math.max(4.5, form.amount.length + 1)}ch`, maxWidth: '100%' }} />
                    </div>
                  </div>

                  {/* type toggle */}
                  <div style={{ display: 'flex', gap: 3, background: 'var(--kpi-bg)', borderRadius: 999, padding: 3 }}>
                    {TYPES.map((t) => {
                      const on = form.type === t.k
                      const c = t.k === 'income' ? 'var(--income)' : t.k === 'savings' ? 'var(--savings)' : 'var(--expense)'
                      return (
                        <button key={t.k} type="button" onClick={() => setForm({ ...form, type: t.k, category: '' })}
                          style={{ flex: 1, padding: '9px 0', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', background: on ? 'var(--surface-1)' : 'transparent', color: on ? c : 'var(--text-muted)', boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none' }}>{t.label}</button>
                      )
                    })}
                  </div>

                  {/* category */}
                  <label style={{ display: 'grid', gap: 5 }}><span className="stat-label">Category</span>
                    <CategorySelect value={form.category} onChange={(v) => setForm({ ...form, category: v })} cats={catsForType} /></label>

                  {form.category === 'Debt Repayment' && debts.length > 0 && (
                    <label style={{ display: 'grid', gap: 5 }}><span className="stat-label">Which debt?</span>
                      <select value={debts.some((d) => d.name === form.description) ? form.description : ''}
                        onChange={(e) => setForm({ ...form, description: e.target.value })} style={inp}>
                        <option value="">— pick a debt (fills description) —</option>
                        {debts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                      </select></label>
                  )}

                  {/* description */}
                  <label style={{ display: 'grid', gap: 5 }}><span className="stat-label">Note <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></span>
                    <input type="text" placeholder="e.g. Groceries at Costco" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inp} /></label>

                  {/* date — a chip that expands to a picker; defaults to Today */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className="stat-label">Date</span>
                    {dateOpen ? (
                      <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} autoFocus
                        style={{ ...inp, width: 'auto', height: 38, WebkitAppearance: 'none', appearance: 'none' }} />
                    ) : (
                      <button type="button" onClick={() => setDateOpen(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>{dateLabel} ▾</button>
                    )}
                    {savedFlash && <span style={{ marginLeft: 'auto', color: 'var(--income)', fontWeight: 600, fontSize: 13 }}>✓ Saved</span>}
                  </div>

                  {singleErr && <div style={{ fontSize: 13, color: 'var(--expense)', fontWeight: 600 }}>{singleErr}</div>}

                  <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </form>
              )
            })()}

            {/* ---------------- IMPORT (AI paste + per-card totals + drafts) ---------------- */}
            {mode === 'batch' && (
              <div style={{ display: 'grid', gap: 12 }}>
                {/* Saved drafts — always visible so saves show up immediately */}
                {drafts.length > 0 && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <span className="stat-label">Saved drafts</span>
                    {drafts.map((dr) => {
                      const isCurrent = draftId === dr.id
                      const dateStr = new Date(dr.updated_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
                      // per-card breakdown: one row per card (count · amount | card name | date)
                      const byCard = new Map<string, { count: number; total: number }>()
                      for (const r of dr.rows || []) {
                        const a = parseFloat(String(r.amount)); if (isNaN(a)) continue
                        const key = r.card || 'No card'
                        const cur = byCard.get(key) || { count: 0, total: 0 }
                        cur.count += 1; cur.total += a; byCard.set(key, cur)
                      }
                      const cardRows = [...byCard.entries()]
                      return (
                        <div key={dr.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => openDraft(dr)} style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6, textAlign: 'left', padding: '11px 14px', borderRadius: 12, border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`, background: isCurrent ? 'var(--accent-soft)' : 'var(--kpi-bg)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)' }}>
                            {isCurrent && <span className="stat-label" style={{ color: 'var(--accent)' }}>Editing</span>}
                            {cardRows.map(([card, v]) => (
                              <div key={card} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{v.count} item{v.count !== 1 ? 's' : ''} · {money(v.total)}</span>
                                <span style={{ textAlign: 'center', fontWeight: 600, color: card === 'No card' ? 'var(--text-muted)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card}</span>
                                <span className="stat-label" style={{ flexShrink: 0 }}>{dateStr}</span>
                              </div>
                            ))}
                          </button>
                          {rows.length > 0 && !isCurrent && (
                            <button onClick={() => appendToDraft(dr)} disabled={savingDraft} aria-label="Add current rows to this draft" title="Add current rows here"
                              style={{ flexShrink: 0, height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>+ Add here</button>
                          )}
                          <button onClick={() => deleteDraft(dr.id)} aria-label="Delete draft" title="Delete draft" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Paste input */}
                {pasteOpen ? (
                  <div style={{ display: 'grid', gap: 10, padding: 14, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--kpi-bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>Paste or screenshot your statement</span>
                      {rows.length > 0 && <button type="button" onClick={() => { setPasteOpen(false); setRaw(''); setImages([]); setImportErr('') }} aria-label="Done adding" title="Done" style={{ display: 'inline-flex', padding: 4, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>}
                    </div>
                    <div className="chip-scroll" style={{ gap: 8 }}>
                      <button type="button" onClick={() => setManageCardsOpen((v) => !v)} title="Add or remove cards"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: `1px solid ${manageCardsOpen ? 'var(--accent)' : 'var(--border)'}`, background: manageCardsOpen ? 'var(--accent-soft)' : 'transparent', color: 'var(--accent)', fontFamily: 'inherit' }}>
                        <Settings2 size={14} /> Cards
                      </button>
                      {cards.length > 0 && <span style={{ width: 1, alignSelf: 'stretch', minHeight: 22, background: 'var(--border)' }} />}
                      {cards.map((c) => {
                        const on = selectedCard === c.name
                        return (
                          <span key={c.id} onClick={() => setSelectedCard(c.name)} title={`Tag this paste as ${c.name}`}
                            style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent)' : 'var(--kpi-bg)', color: on ? '#fff' : 'var(--text-secondary)' }}>
                            {c.name}
                          </span>
                        )
                      })}
                      {cards.length === 0 && <span className="stat-label">No cards yet — tap “Cards” to add one.</span>}
                    </div>

                    {/* Manage cards panel */}
                    {manageCardsOpen && (
                      <div style={{ display: 'grid', gap: 6, padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--kpi-bg)' }}>
                        <span className="stat-label">Manage cards</span>
                        {cards.map((c) => (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 4px', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontWeight: 600 }}>{c.name}</span>
                            <button type="button" onClick={() => setConfirmDel({ kind: 'card', id: c.id, name: c.name })} aria-label={`Delete ${c.name}`} title="Delete card"
                              style={{ display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--expense)', cursor: 'pointer' }}><Trash2 size={15} /></button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <input value={newCard} onChange={(e) => setNewCard(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCardInline() } }}
                            placeholder="New card name (e.g. WS Visa)" style={{ ...cell, flex: 1, height: 38 }} />
                          <button type="button" onClick={addCardInline} disabled={!newCard.trim()} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 14px', height: 38, borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontFamily: 'inherit' }}>
                            <Plus size={14} /> Add
                          </button>
                        </div>
                      </div>
                    )}
                    <textarea value={raw} onChange={(e) => setRaw(e.target.value)} onPaste={onPasteInput} rows={7}
                      placeholder={'Paste text from your bank/card — or add a screenshot below (you can also paste an image here). Pending, posted, totals, times… the AI cleans it up.'}
                      style={{ ...inp, height: 'auto', padding: 12, fontSize: 14, lineHeight: 1.5, resize: 'vertical' }} />

                    {/* Screenshot attach + thumbnails */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-secondary)' }}>
                        <ImagePlus size={15} /> Add image
                        <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                          onChange={(e) => { if (e.target.files) addImageFiles(e.target.files); e.target.value = '' }} />
                      </label>
                    </div>
                    {images.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {images.map((im) => (
                          <div key={im.id} style={{ position: 'relative' }}>
                            <img src={im.preview} alt="screenshot" style={{ height: 68, width: 'auto', maxWidth: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                            <button type="button" onClick={() => setImages((prev) => prev.filter((x) => x.id !== im.id))} aria-label="Remove"
                              style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: 999, border: 'none', background: 'var(--expense)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {importErr && <div style={{ fontSize: 13, color: 'var(--expense)', fontWeight: 600 }}>{importErr}</div>}
                    <button className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={(!raw.trim() && images.length === 0) || parsing} onClick={formatWithAI}>
                      {parsing ? 'Reading…' : `Format with AI${images.length ? ` · ${images.length} image${images.length !== 1 ? 's' : ''}` : ''}`}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center', minWidth: 130 }} onClick={() => { setPasteOpen(true); setImportErr('') }}>
                      <ClipboardPaste size={15} /> Paste more
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ flex: '0 0 auto' }} onClick={newBatch} title="Start a fresh batch (e.g. a different card)">
                      <Plus size={15} /> New batch
                    </button>
                  </div>
                )}

                {/* Review grid + per-card totals */}
                {rows.length > 0 && (
                  <>
                    {/* summary bar */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>Review</span>
                        <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                          {rows.length} item{rows.length !== 1 ? 's' : ''}{invalidCount > 0 && <span style={{ color: 'var(--expense)', fontWeight: 600 }}> · {invalidCount} to fix</span>}
                        </span>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 17 }}>{money(grandTotal)}</span>
                    </div>
                    {cardTotals.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {cardTotals.map(([card, tot]) => (
                          <span key={card} style={{ fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'var(--kpi-bg)', border: '1px solid var(--border)' }}>{card} · {money(tot)}</span>
                        ))}
                      </div>
                    )}

                    {/* Review — one stacked card per row (no horizontal scroll on mobile) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '46vh', overflowY: 'auto', paddingRight: 2 }}>
                      {rows.map((r, i) => {
                        const badAmt = isNaN(parseFloat(r.amount)) || parseFloat(r.amount) <= 0
                        return (
                          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'var(--kpi-bg)', display: 'grid', gap: 7 }}>
                            {/* line 1: category + amount + delete */}
                            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                              <select value={r.category}
                                onChange={(e) => { const c = cats.find((x) => x.name === e.target.value); updateRow(i, { category: e.target.value, type: c?.type ?? r.type }) }}
                                style={{ ...cell, flex: 1, borderColor: r.category ? 'var(--border)' : 'var(--expense)' }}>
                                <option value="">— category —</option>
                                <optgroup label="Income">{grouped.income.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>
                                <optgroup label="Expense">{grouped.expense.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>
                                <optgroup label="Savings">{grouped.savings.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>
                              </select>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>$</span>
                                <input inputMode="decimal" value={r.amount} onChange={(e) => updateRow(i, { amount: e.target.value.replace(/[^0-9.]/g, '') })}
                                  style={{ ...cell, width: 78, textAlign: 'right', fontWeight: 700, borderColor: badAmt ? 'var(--expense)' : 'var(--border)' }} placeholder="0.00" />
                              </div>
                              <button onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove" title="Remove"
                                style={{ flexShrink: 0, display: 'inline-flex', justifyContent: 'center', padding: 7, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                            {/* line 2: description */}
                            <input type="text" value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} style={{ ...cell, height: 36 }} placeholder="Note (optional)" />
                            {/* line 3: date + card */}
                            <div style={{ display: 'flex', gap: 7 }}>
                              <input type="date" value={r.date} onChange={(e) => updateRow(i, { date: e.target.value })}
                                style={{ ...cell, flex: 1, height: 36, WebkitAppearance: 'none', appearance: 'none', borderColor: isDate(r.date) ? 'var(--border)' : 'var(--expense)' }} />
                              <select value={r.card || ''} onChange={(e) => updateRow(i, { card: e.target.value || undefined })} style={{ ...cell, flex: 1, height: 36 }}>
                                <option value="">No card</option>
                                {cards.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                                {r.card && !cards.some((c) => c.name === r.card) && <option value={r.card}>{r.card}</option>}
                              </select>
                            </div>
                          </div>
                        )
                      })}
                      <button type="button" onClick={() => setRows((prev) => [...prev, { date: today(), description: '', category: '', type: 'expense', amount: '', card: selectedCard || undefined }])}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                        <Plus size={14} /> Add row
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-secondary" style={{ flex: '0 0 auto' }} disabled={saving || savingDraft} onClick={saveDraft}>
                        {savingDraft ? 'Saving…' : <>💾 {draftId ? 'Update draft' : 'Save draft'}</>}
                      </button>
                      <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', minWidth: 160 }} disabled={saving || savingDraft || validCount === 0} onClick={logBatch}>
                        {saving ? 'Logging…' : `Log ${validCount} transaction${validCount !== 1 ? 's' : ''}${invalidCount ? ` (skips ${invalidCount})` : ''}`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ---------------- RECURRING ---------------- */}
            {mode === 'recurring' && (
              <div style={{ display: 'grid', gap: 12 }}>
                {recEdit !== null ? (
                  /* Add / edit a recurring item */
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><Repeat size={15} /> {recEdit === 'new' ? 'New recurring item' : 'Edit recurring item'}</div>
                    <div className="form-2">
                      <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Name</span>
                        <input style={inp} value={recForm.name} onChange={(e) => setRecForm({ ...recForm, name: e.target.value })} placeholder="e.g. Rent" /></label>
                      <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Type</span>
                        <select style={inp} value={recForm.type} onChange={(e) => setRecForm({ ...recForm, type: e.target.value, category: '' })}>
                          <option value="income">Income</option><option value="expense">Expense</option><option value="savings">Savings</option>
                        </select></label>
                    </div>
                    <div className="form-2">
                      <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Category</span>
                        <CategorySelect value={recForm.category} onChange={(v) => setRecForm({ ...recForm, category: v })} cats={cats.filter((c) => c.type === recForm.type)} /></label>
                      <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Amount</span>
                        <input style={inp} type="number" step="0.01" value={recForm.amount} onChange={(e) => setRecForm({ ...recForm, amount: e.target.value })} placeholder="0.00" /></label>
                    </div>
                    {recForm.category === 'Debt Repayment' && debts.length > 0 && (
                      <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Which debt?</span>
                        <select style={inp} value={debts.some((d) => d.name === recForm.description) ? recForm.description : ''}
                          onChange={(e) => setRecForm({ ...recForm, description: e.target.value })}>
                          <option value="">— pick a debt (fills description) —</option>
                          {debts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                        </select></label>
                    )}
                    <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Description (optional)</span>
                      <input style={inp} value={recForm.description} onChange={(e) => setRecForm({ ...recForm, description: e.target.value })} placeholder="e.g. matches a debt name" /></label>
                    {recErr && <div style={{ fontSize: 13, color: 'var(--expense)', fontWeight: 600 }}>{recErr}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={saving} onClick={saveRec}>{recEdit === 'new' ? 'Add' : 'Save'}</button>
                      <button className="btn btn-secondary" onClick={() => { setRecEdit(null); setRecErr('') }}>Cancel</button>
                      {recEdit !== 'new' && <button className="btn btn-secondary" style={{ flex: '0 0 auto' }} onClick={deleteRec}><Trash2 size={14} /> Delete</button>}
                    </div>
                  </div>
                ) : recs.length === 0 ? (
                  <div style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center', padding: '8px 0' }}>
                    <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: 0 }}>
                      No recurring items yet. Add your regulars (rent, subs, paycheques…), then log them here in one tap.
                    </p>
                    <button className="btn btn-primary" onClick={startNewRec}><Plus size={15} /> Add recurring item</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      {manageRec ? (
                        <>
                          <button className="btn btn-secondary" onClick={startNewRec}><Plus size={15} /> New</button>
                          <button className="btn btn-secondary" onClick={() => setManageRec(false)}>Done</button>
                        </>
                      ) : (
                        <>
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span className="stat-label">Log for</span>
                            <input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} style={{ ...inp, width: 'auto' }} /></label>
                          <button onClick={() => setManageRec(true)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Settings2 size={14} /> Manage</button>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, maxHeight: '46vh', overflowY: 'auto' }}>
                      {recGroupsPresent.map((g) => (
                        <div key={g.key}>
                          <span style={{ display: 'inline-block', background: g.soft, color: g.color, padding: '3px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{g.label}</span>
                          <div style={{ display: 'grid', gap: 2 }}>
                            {recs.filter((r) => recGroup(r) === g.key).map((r) => {
                              const on = picked.has(r.id)
                              const toggle = () => setPicked((p) => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })
                              return (
                                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                                  {!manageRec && <input type="checkbox" checked={on} onChange={toggle} />}
                                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={manageRec ? () => startEditRec(r) : toggle}>
                                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                                    <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{r.category}</div>
                                  </div>
                                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{money(Number(r.amount))}</span>
                                  {manageRec && (
                                    <button aria-label="Edit" title="Edit" onClick={() => startEditRec(r)}
                                      style={{ flexShrink: 0, display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><PencilLine size={14} /></button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {recErr && <div style={{ fontSize: 13, color: 'var(--expense)', fontWeight: 600 }}>{recErr}</div>}
                    {!manageRec && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={saving || picked.size === 0} onClick={logRecurring}>
                          {saving ? 'Logging…'
                            : picked.size === 0 ? 'Select items to log'
                            : `Log ${picked.size} item${picked.size !== 1 ? 's' : ''} · ${money(pickedTotal)}`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* inline confirm (replaces window.confirm) */}
            {confirmDel && (
              <div onClick={() => setConfirmDel(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', borderRadius: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 10 }}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, width: '100%', maxWidth: 320, boxShadow: '0 12px 34px rgba(0,0,0,0.35)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Delete {confirmDel.name || 'this'}?</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>This can’t be undone.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setConfirmDel(null)}>Cancel</button>
                    <button className="btn" style={{ flex: 1, justifyContent: 'center', background: 'var(--expense)', color: '#fff', border: 'none' }} onClick={doConfirmDel}>Delete</button>
                  </div>
                </div>
              </div>
            )}

            {/* inline success toast (replaces alert) */}
            {flash && (
              <div style={{ position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)', background: 'var(--text-primary)', color: 'var(--surface-1)', padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, boxShadow: '0 6px 18px rgba(0,0,0,0.28)', zIndex: 11, whiteSpace: 'nowrap' }}>✓ {flash}</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

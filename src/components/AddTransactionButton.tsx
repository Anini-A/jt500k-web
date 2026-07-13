'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, ClipboardPaste, PencilLine, Repeat } from 'lucide-react'
import IconPill from './IconPill'
import CategorySelect from './CategorySelect'
import { getJSON } from '@/lib/fresh'

interface Category { name: string; type: string }
interface Row { date: string; description: string; category: string; type: string; amount: string }

const inp: React.CSSProperties = {
  height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}
const cell: React.CSSProperties = { ...inp, height: 38, padding: '0 8px', fontSize: 13 }
// Calm, non-flashing red for the Cancel action
const cancelBtn: React.CSSProperties = { background: 'var(--expense-soft)', color: 'var(--expense)', border: '1px solid var(--expense)', flex: '0 0 auto' }

// Old sheet names → current category names (user still copies from the old sheet)
const ALIASES: Record<string, string> = {
  'transpo': 'Transportation', 'perso': 'Personal', 'subs': 'Subscriptions',
  'entmt': 'Entertainment', 'edu': 'Education', 'hf fun m': 'HF Fun Money',
  'ja fun m': 'JA Fun Money', 'baby exp': 'Baby',
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const rowValid = (r: Row) => isDate(r.date) && !!r.category && !isNaN(parseFloat(r.amount)) && parseFloat(r.amount) > 0

function normalizeDate(s: string): string {
  s = (s || '').trim()
  if (isDate(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10)
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
    let category = '', type = 'expense'
    if (catRaw) {
      const aliased = ALIASES[catRaw.toLowerCase()] || catRaw
      const m = byLower.get(aliased.toLowerCase())
      if (m) { category = m.name; type = m.type }
    }
    out.push({ date: normalizeDate(d), description: desc, category, type, amount: isNaN(amt) ? '' : String(amt) })
  }
  return out
}

// Header "Add Transaction" pill that opens a modal. Works on any page.
export default function AddTransactionButton() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'single' | 'batch' | 'recurring'>('single')
  const [saving, setSaving] = useState(false)
  const [cats, setCats] = useState<Category[]>([])
  const [debts, setDebts] = useState<{ name: string }[]>([])
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10), type: 'expense', category: '', amount: '', description: '',
  })
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [recs, setRecs] = useState<any[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [recFilter, setRecFilter] = useState('all') // 'all' | group key
  const [recDate, setRecDate] = useState(new Date().toISOString().slice(0, 10))

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

  const close = () => { setOpen(false); setMode('single'); setRaw(''); setRows(null) }

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
      else alert('Error: ' + ((await res.json()).error || 'could not save'))
    } finally { setSaving(false) }
  }

  const submitSingle = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      })
      if (res.ok) { close(); window.dispatchEvent(new CustomEvent('transaction-added')) }
      else alert('Error: ' + ((await res.json()).error || 'could not save'))
    } finally { setSaving(false) }
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
      if (res.ok) { close(); window.dispatchEvent(new CustomEvent('transaction-added')) }
      else alert('Error: ' + ((await res.json()).error || 'could not save'))
    } finally { setSaving(false) }
  }

  const catsForType = cats.filter((c) => c.type === form.type)
  const grouped = { income: cats.filter((c) => c.type === 'income'), expense: cats.filter((c) => c.type === 'expense'), savings: cats.filter((c) => c.type === 'savings') }
  const validCount = (rows ?? []).filter(rowValid).length
  const invalidCount = (rows ?? []).length - validCount

  // Recurring: group into the same buckets as the Budget tab
  const recGroup = (r: any) => r.type === 'income' ? 'income' : r.type === 'savings' ? 'saving' : r.category === 'Debt Repayment' ? 'debt' : 'spending'
  const REC_GROUPS = [
    { key: 'income', label: '💰 Income' }, { key: 'spending', label: '💸 Spending' },
    { key: 'saving', label: '🏦 Saving' }, { key: 'debt', label: '🧾 Debt' },
  ]
  const recGroupsPresent = REC_GROUPS.filter((g) => recs.some((r) => recGroup(r) === g.key))
  const shownRecs = recs.filter((r) => recFilter === 'all' || recGroup(r) === recFilter)
  const pickedTotal = recs.filter((r) => picked.has(r.id)).reduce((s, r) => s + Number(r.amount), 0)
  const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev!.map((r, idx) => idx === i ? { ...r, ...patch } : r))


  return (
    <>
      <IconPill icon={<Plus />} label="Add Transaction" accent onClick={() => setOpen(true)} />

      {open && createPortal(
        <div className="modal-backdrop" onClick={close}>
          <div className="modal-card glass" style={{ width: 'min(820px, 100%)', minHeight: 'min(78vh, 540px)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>➕ Add Transaction</h2>
                <button className="modal-x" aria-label="Close" onClick={close}>✕</button>
              </div>
              <div className="tabs" style={{ padding: 3, marginTop: 12 }}>
                <button className={`tab ${mode === 'single' ? 'tab-active' : ''}`} style={{ flex: 1, justifyContent: 'center', padding: '7px 8px', fontSize: 13 }} onClick={() => setMode('single')}>
                  <PencilLine size={14} /> Single
                </button>
                <button className={`tab ${mode === 'batch' ? 'tab-active' : ''}`} style={{ flex: 1, justifyContent: 'center', padding: '7px 8px', fontSize: 13 }} onClick={() => setMode('batch')}>
                  <ClipboardPaste size={14} /> Paste
                </button>
                <button className={`tab ${mode === 'recurring' ? 'tab-active' : ''}`} style={{ flex: 1, justifyContent: 'center', padding: '7px 8px', fontSize: 13 }} onClick={() => setMode('recurring')}>
                  <Repeat size={14} /> Recurring
                </button>
              </div>
            </div>

            {/* ---------------- SINGLE ---------------- */}
            {mode === 'single' && (
              <form onSubmit={submitSingle} style={{ display: 'grid', gap: 12 }}>
                <div className="form-2">
                  <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Date</span>
                    <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp} /></label>
                  <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Type</span>
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, category: '' })} style={inp}>
                      <option value="income">Income</option><option value="expense">Expense</option><option value="savings">Savings</option>
                    </select></label>
                </div>
                <div className="form-2">
                  <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Category</span>
                    <CategorySelect value={form.category} onChange={(v) => setForm({ ...form, category: v })} cats={catsForType} /></label>
                  <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Amount</span>
                    <input type="number" step="0.01" required placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inp} /></label>
                </div>
                {form.category === 'Debt Repayment' && debts.length > 0 && (
                  <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Which debt?</span>
                    <select value={debts.some((d) => d.name === form.description) ? form.description : ''}
                      onChange={(e) => setForm({ ...form, description: e.target.value })} style={inp}>
                      <option value="">— pick a debt (fills description) —</option>
                      {debts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select></label>
                )}
                <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Description</span>
                  <input type="text" placeholder="e.g. Groceries" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inp} /></label>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button type="button" className="btn" style={cancelBtn} onClick={close}>Cancel</button>
                  <button className="btn btn-primary" type="submit" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                    {saving ? 'Saving…' : '💾 Save Transaction'}
                  </button>
                </div>
              </form>
            )}

            {/* ---------------- BATCH ---------------- */}
            {mode === 'batch' && !rows && (
              <div style={{ display: 'grid', gap: 12 }}>
                <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: 0 }}>
                  Paste rows copied from your sheet — columns in order: <strong>Date&nbsp;·&nbsp;Description&nbsp;·&nbsp;Category&nbsp;·&nbsp;Amount</strong> (a header row is fine, it's skipped). Old category names like “Baby Exp” map automatically.
                </p>
                <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={9}
                  placeholder={'2026-07-05\tUber Canada/Ubereats\tFood\t33.36\n2026-07-04\tCostco Wholesale\tFood\t127.61'}
                  style={{ ...inp, height: 'auto', padding: 12, fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }} />
                <button className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={!raw.trim()}
                  onClick={() => setRows(parsePaste(raw, cats))}>
                  👀 Preview {raw.trim() ? `(${raw.trim().split(/\r?\n/).filter((l) => l.trim() && !/^date/i.test(l.trim())).length} rows)` : ''}
                </button>
              </div>
            )}

            {mode === 'batch' && rows && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    Review {rows.length} transaction{rows.length !== 1 ? 's' : ''} — edit anything, then log.
                    {invalidCount > 0 && <span style={{ color: 'var(--expense)', fontWeight: 600 }}>&nbsp;{invalidCount} need attention</span>}
                  </span>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setRows(null)}>← Edit paste</button>
                </div>

                {/* header */}
                <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 620 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 150px 100px 32px', gap: 8, padding: '0 2px' }}>
                  {['Date', 'Description', 'Category', 'Amount', ''].map((h) => <span key={h} className="stat-label">{h}</span>)}
                </div>

                <div style={{ display: 'grid', gap: 6, maxHeight: '46vh', overflowY: 'auto' }}>
                  {rows.map((r, i) => {
                    const bad = !rowValid(r)
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 150px 100px 32px', gap: 8, alignItems: 'center' }}>
                        <input type="date" value={r.date} onChange={(e) => updateRow(i, { date: e.target.value })}
                          style={{ ...cell, borderColor: isDate(r.date) ? 'var(--border)' : 'var(--expense)' }} />
                        <input type="text" value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} style={cell} placeholder="Description" />
                        <select value={r.category}
                          onChange={(e) => {
                            const c = cats.find((x) => x.name === e.target.value)
                            updateRow(i, { category: e.target.value, type: c?.type ?? r.type })
                          }}
                          style={{ ...cell, borderColor: r.category ? 'var(--border)' : 'var(--expense)' }}>
                          <option value="">— pick —</option>
                          <optgroup label="Income">{grouped.income.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>
                          <optgroup label="Expense">{grouped.expense.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>
                          <optgroup label="Savings">{grouped.savings.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>
                        </select>
                        <input type="number" step="0.01" value={r.amount} onChange={(e) => updateRow(i, { amount: e.target.value })}
                          style={{ ...cell, borderColor: !isNaN(parseFloat(r.amount)) && parseFloat(r.amount) > 0 ? 'var(--border)' : 'var(--expense)' }} placeholder="0.00" />
                        <button onClick={() => setRows((prev) => prev!.filter((_, idx) => idx !== i))} aria-label="Remove" title="Remove row"
                          style={{ display: 'inline-flex', justifyContent: 'center', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn" style={cancelBtn} onClick={close}>Cancel</button>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={saving || validCount === 0}
                    onClick={logBatch}>
                    {saving ? 'Logging…' : `💾 Log ${validCount} transaction${validCount !== 1 ? 's' : ''}${invalidCount ? ` (skips ${invalidCount})` : ''}`}
                  </button>
                </div>
              </div>
            )}

            {/* ---------------- RECURRING ---------------- */}
            {mode === 'recurring' && (
              <div style={{ display: 'grid', gap: 12 }}>
                {recs.length === 0 ? (
                  <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: 0 }}>
                    No recurring items yet. Add them in <strong>Settings → 🔁 Recurring</strong> (rent, subs, paychecks…), then log them here in one tap.
                  </p>
                ) : (
                  <>
                    {/* Group pills + date */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className={`chip ${recFilter === 'all' ? 'chip-active' : ''}`} onClick={() => setRecFilter('all')}>All</button>
                        {recGroupsPresent.map((g) => (
                          <button key={g.key} className={`chip ${recFilter === g.key ? 'chip-active' : ''}`} onClick={() => setRecFilter(g.key)}>{g.label}</button>
                        ))}
                      </div>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span className="stat-label">Date</span>
                        <input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} style={{ ...inp, width: 'auto' }} /></label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, maxHeight: '46vh', overflowY: 'auto' }}>
                      {shownRecs.map((r) => {
                        const on = picked.has(r.id)
                        return (
                          <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={on} onChange={() => setPicked((p) => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{r.category}</div>
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{money(Number(r.amount))}</span>
                          </label>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button type="button" className="btn" style={cancelBtn} onClick={close}>Cancel</button>
                      <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={saving || picked.size === 0} onClick={logRecurring}>
                        {saving ? 'Logging…'
                          : picked.size === 0 ? 'Select items to log'
                          : `💾 Log ${picked.size} item${picked.size !== 1 ? 's' : ''} · ${money(pickedTotal)}`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

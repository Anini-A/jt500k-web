'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Trash2, Search, Pencil } from 'lucide-react'
import Link from 'next/link'
import HeaderNav from '@/components/HeaderNav'
import PagePill from '@/components/PagePill'
import Logo from '@/components/Logo'
import EditTransactionModal from '@/components/EditTransactionModal'
import { getJSON } from '@/lib/fresh'
import { today, ymd } from '@/lib/date'

interface Txn {
  id: string
  date: string
  type: 'income' | 'expense' | 'savings'
  category: string | null
  description: string | null
  amount: number
}

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
const money0 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
// friendly day header: Today / Yesterday / "Mon, Aug 11"
function dayLabel(iso: string): string {
  const t = today()
  if (iso === t) return 'Today'
  const y = ymd(new Date(new Date(t + 'T12:00:00').getTime() - 86400000))
  if (iso === y) return 'Yesterday'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}
const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expenses' },
  { key: 'savings', label: 'Savings' },
]
type Preset = 'all' | 'ytd' | '12m' | '6m' | 'month' | 'custom'
// Canonical range set used across the app (Custom only here, where dates are editable).
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'This month' }, { key: 'ytd', label: 'YTD' },
  { key: '6m', label: '6M' }, { key: '12m', label: '12M' }, { key: 'all', label: 'All' }, { key: 'custom', label: 'Custom' },
]
const subMonths = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() - n); return ymd(d) }

export default function Transactions() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [cat, setCat] = useState('all')
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [searchFocus, setSearchFocus] = useState(false)    // search expands to fill the row while focused
  const activePresetRef = useRef<HTMLButtonElement>(null) // keep the selected period visible in the scroll row
  useEffect(() => { activePresetRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [preset])
  const [editTx, setEditTx] = useState<Txn | null>(null)
  const [openId, setOpenId] = useState<string | null>(null) // mobile: row whose actions are revealed

  const load = useCallback(async () => {
    const data = await getJSON('/api/data').catch(() => [])
    if (Array.isArray(data)) setTxns(data.map((t: any) => ({ ...t, amount: Number(t.amount) })))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const minDate = txns.length ? txns[0].date : ''
  const maxDate = txns.length ? txns[txns.length - 1].date : ''

  // effective date range from the active preset (anchored to today, so future-dated
  // entries never shift "this month"); 'custom' uses the date inputs.
  const range = useMemo(() => {
    const t = today()
    if (preset === 'custom') return { from: from || minDate, to: to || maxDate }
    if (preset === 'all') return { from: '', to: '' }
    if (preset === 'ytd') return { from: t.slice(0, 4) + '-01-01', to: t }
    // full calendar month (incl. future-dated entries in this month) — matches the budget's month
    if (preset === 'month') return { from: t.slice(0, 7) + '-01', to: ymd(new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)), 0)) }
    const n = preset === '12m' ? 12 : 6
    return { from: subMonths(t, n), to: t }
  }, [preset, from, to, minDate, maxDate])

  // categories present, respecting the active type filter
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const t of txns) {
      if (type !== 'all' && t.type !== type) continue
      if (t.category) set.add(t.category)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [txns, type])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return txns
      .filter((t) => type === 'all' || t.type === type)
      .filter((t) => cat === 'all' || t.category === cat)
      .filter((t) => (!range.from || t.date >= range.from) && (!range.to || t.date <= range.to))
      .filter((t) => !term || (t.description || '').toLowerCase().includes(term) || (t.category || '').toLowerCase().includes(term))
      .slice()
      .reverse()
  }, [txns, q, type, cat, range])

  // if the chosen category isn't valid for the current type, reset it
  useEffect(() => {
    if (cat !== 'all' && !categories.includes(cat)) setCat('all')
  }, [categories, cat])

  const del = async (id: string) => {
    if (!confirm('Delete this transaction?')) return
    const res = await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })
    if (res.ok) setTxns((prev) => prev.filter((t) => t.id !== id))
    else alert('Could not delete.')
  }

  // running summary for the current filter
  const summary = useMemo(() => {
    let inc = 0, exp = 0
    for (const t of filtered) { if (t.type === 'income') inc += t.amount; else if (t.type === 'expense') exp += t.amount }
    return { inc, exp, count: filtered.length }
  }, [filtered])
  // group the (newest-first) list into consecutive-day buckets for sticky headers
  const groups = useMemo(() => {
    const out: { date: string; items: Txn[] }[] = []
    for (const t of filtered) {
      const last = out[out.length - 1]
      if (last && last.date === t.date) last.items.push(t)
      else out.push({ date: t.date, items: [t] })
    }
    return out
  }, [filtered])

  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top">
          <Link href="/" className="brand" aria-label="Home"><Logo /></Link>
          <PagePill current="transactions" />
          <HeaderNav current="transactions" />
        </header>

        {/* Controls — minimalist, all one-click: period · type · category+search (dates only for Custom) */}
        <section className="block">
          <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* period — This month first, Custom last */}
            <div className="chip-scroll">
              {PRESETS.map((p) => (
                <button key={p.key} ref={preset === p.key ? activePresetRef : null}
                  onClick={() => { setPreset(p.key); if (p.key === 'custom') { if (!from) setFrom(range.from || minDate); if (!to) setTo(range.to || maxDate) } }}
                  className={`chip ${preset === p.key ? 'chip-active' : ''}`}>{p.label}</button>
              ))}
            </div>
            {/* dates — only when Custom is selected */}
            {preset === 'custom' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                <input type="date" className="date-input" style={{ flex: 1, minWidth: 0 }} value={from || minDate} min={minDate} max={maxDate}
                  onChange={(e) => setFrom(e.target.value)} />
                <span className="stat-label">to</span>
                <input type="date" className="date-input" style={{ flex: 1, minWidth: 0 }} value={to || maxDate} min={minDate} max={maxDate}
                  onChange={(e) => setTo(e.target.value)} />
              </div>
            )}
            {/* type */}
            <div className="chip-scroll">
              {TYPES.map((t) => (
                <button key={t.key} onClick={() => setType(t.key)} className={`chip ${type === t.key ? 'chip-active' : ''}`}>{t.label}</button>
              ))}
            </div>
            {/* category + search — search expands to fill while focused; category slides back on blur */}
            <div style={{ display: 'flex', gap: searchFocus ? 0 : 8, alignItems: 'center', minWidth: 0 }}>
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="date-input"
                style={{ flex: '0 1 220px', minWidth: searchFocus ? 0 : 120, maxWidth: searchFocus ? 0 : 220, opacity: searchFocus ? 0 : 1, paddingLeft: searchFocus ? 0 : undefined, paddingRight: searchFocus ? 0 : undefined, borderWidth: searchFocus ? 0 : 1, overflow: 'hidden', transition: 'max-width .25s ease, min-width .25s ease, opacity .18s ease' }} aria-label="Filter by category">
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px', borderRadius: 999, background: 'var(--glass-bg)', border: `1px solid ${searchFocus ? 'var(--accent)' : 'var(--glass-border)'}`, boxShadow: 'var(--glass-sheen)', transition: 'border-color .18s ease' }}>
                <Search style={{ width: 18, height: 18, flexShrink: 0, color: 'var(--text-secondary)' }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions…"
                  onFocus={() => setSearchFocus(true)} onBlur={() => setSearchFocus(false)}
                  style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', fontSize: 16, fontFamily: 'inherit' }} />
              </label>
            </div>
          </div>
        </section>

        {/* List */}
        <section className="block" style={{ marginBottom: 64 }}>
          <div className="card glass">
            {/* summary strip */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
              <span className="hdr-label">{loading ? 'Loading…' : `${summary.count} transaction${summary.count !== 1 ? 's' : ''}`}</span>
              {!loading && summary.count > 0 && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  <b style={{ color: 'var(--income)', fontWeight: 700 }}>↑ {money0(summary.inc)}</b> in · <b style={{ color: 'var(--expense)', fontWeight: 700 }}>↓ {money0(summary.exp)}</b> out
                </span>
              )}
            </div>

            {!loading && filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No matching transactions.</div>
            ) : (
              <div style={{ maxHeight: 1140, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                {groups.map((g) => (
                  <div key={g.date}>
                    {/* sticky day header — show the exact date only when the label is relative */}
                    {(() => {
                      const lbl = dayLabel(g.date)
                      const rel = lbl === 'Today' || lbl === 'Yesterday'
                      return (
                        <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '8px 4px 6px', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', background: 'color-mix(in srgb, var(--surface-1) 66%, transparent)' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{lbl}</span>
                          {rel && <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{new Date(g.date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                        </div>
                      )
                    })()}
                    {g.items.map((t) => (
                      <div key={t.id} className={`list-row ${openId === t.id ? 'open' : ''}`}
                        onClick={() => setOpenId((id) => (id === t.id ? null : t.id))}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description || t.category}</div>
                          <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 9px' }}>{t.category}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <span className={`stat-value ${t.type}`} style={{ fontSize: 16, fontWeight: 700 }}>
                            {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}
                          </span>
                          <div className="row-actions">
                            <button onClick={(e) => { e.stopPropagation(); setEditTx(t) }} aria-label="Edit" title="Edit"
                              style={{ display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                              <Pencil size={16} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); del(t.id) }} aria-label="Delete" title="Delete"
                              style={{ display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {editTx && (
        <EditTransactionModal
          tx={editTx}
          onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); load() }}
        />
      )}
    </div>
  )
}

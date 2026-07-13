'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Trash2, Search, Pencil } from 'lucide-react'
import HeaderNav from '@/components/HeaderNav'
import EditTransactionModal from '@/components/EditTransactionModal'
import { getJSON } from '@/lib/fresh'

interface Txn {
  id: string
  date: string
  type: 'income' | 'expense' | 'savings'
  category: string | null
  description: string | null
  amount: number
}

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expenses' },
  { key: 'savings', label: 'Savings' },
]

export default function Transactions() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [cat, setCat] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
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
      .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
      .filter((t) => !term || (t.description || '').toLowerCase().includes(term) || (t.category || '').toLowerCase().includes(term))
      .slice()
      .reverse()
  }, [txns, q, type, cat, from, to])

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

  const total = filtered.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.type === 'income' ? t.amount : 0), 0)

  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top">
          <div className="brand"><span>All Transactions</span></div>
          <HeaderNav current="transactions" />
        </header>

        {/* Controls */}
        <section className="block">
          <div className="card glass" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
              {TYPES.map((t) => (
                <button key={t.key} onClick={() => setType(t.key)} className={`chip ${type === t.key ? 'chip-active' : ''}`} style={{ flexShrink: 0 }}>{t.label}</button>
              ))}
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="date-input"
                style={{ flexShrink: 1, maxWidth: 190, minWidth: 0 }} aria-label="Filter by category">
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className={`search-expand ${q ? 'has-value' : ''}`} style={{ height: 38, flexShrink: 0 }}>
                <Search />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
              <input type="date" className="date-input" value={from || minDate} min={minDate} max={maxDate}
                onChange={(e) => setFrom(e.target.value)} />
              <span className="stat-label">to</span>
              <input type="date" className="date-input" value={to || maxDate} min={minDate} max={maxDate}
                onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </section>

        {/* List */}
        <section className="block" style={{ marginBottom: 64 }}>
          <div className="card glass">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="stat-label">{loading ? 'Loading…' : `${filtered.length} transactions`}</span>
            </div>
            {!loading && filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No matching transactions.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, maxHeight: 1140, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                {filtered.map((t) => (
                  <div key={t.id} className={`list-row ${openId === t.id ? 'open' : ''}`}
                    onClick={() => setOpenId((id) => (id === t.id ? null : t.id))}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description || t.category}</div>
                      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>{t.date} · {t.category}</div>
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

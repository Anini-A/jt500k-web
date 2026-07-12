'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, Search, Pencil } from 'lucide-react'
import HeaderNav from '@/components/HeaderNav'
import CategorySelect from '@/components/CategorySelect'
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
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cats, setCats] = useState<{ name: string; type: string }[]>([])
  const [editTx, setEditTx] = useState<Txn | null>(null)

  const load = useCallback(async () => {
    const data = await getJSON('/api/data').catch(() => [])
    if (Array.isArray(data)) setTxns(data.map((t: any) => ({ ...t, amount: Number(t.amount) })))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    getJSON('/api/categories').then((d) => Array.isArray(d) && setCats(d)).catch(() => {})
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const minDate = txns.length ? txns[0].date : ''
  const maxDate = txns.length ? txns[txns.length - 1].date : ''

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return txns
      .filter((t) => type === 'all' || t.type === type)
      .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
      .filter((t) => !term || (t.description || '').toLowerCase().includes(term) || (t.category || '').toLowerCase().includes(term))
      .slice()
      .reverse()
  }, [txns, q, type, from, to])

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
          <div className="card glass" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {TYPES.map((t) => (
                <button key={t.key} onClick={() => setType(t.key)} className={`chip ${type === t.key ? 'chip-active' : ''}`} style={{ flexShrink: 0 }}>{t.label}</button>
              ))}
              <div className={`search-expand ${q ? 'has-value' : ''}`} style={{ height: 38, flexShrink: 0 }}>
                <Search />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
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
              <div style={{ display: 'grid', gap: 2, maxHeight: 1140, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                {filtered.map((t) => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description || t.category}</div>
                      <div className="stat-label">{t.date} · {t.category}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span className={`stat-value ${t.type}`} style={{ fontSize: 16 }}>
                        {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}
                      </span>
                      <button onClick={() => setEditTx(t)} aria-label="Edit" title="Edit"
                        style={{ display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => del(t.id)} aria-label="Delete" title="Delete"
                        style={{ display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {editTx && (
        <EditModal
          tx={editTx}
          cats={cats}
          onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); load() }}
        />
      )}
    </div>
  )
}

// ---- Edit transaction modal ----
const inp: React.CSSProperties = {
  height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

function EditModal({ tx, cats, onClose, onSaved }: {
  tx: Txn
  cats: { name: string; type: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    date: tx.date,
    category: tx.category || '',
    amount: String(tx.amount),
    description: tx.description || '',
  })
  const [saving, setSaving] = useState(false)
  const [debts, setDebts] = useState<{ name: string }[]>([])

  useEffect(() => {
    if (form.category === 'Debt Repayment' && debts.length === 0) {
      getJSON('/api/debts').then((d) => Array.isArray(d) && setDebts(d)).catch(() => {})
    }
  }, [form.category, debts.length])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tx.id,
          date: form.date,
          category: form.category || undefined,
          amount: parseFloat(form.amount),
          description: form.description,
        }),
      })
      if (res.ok) onSaved()
      else alert('Error: ' + ((await res.json()).error || 'could not save'))
    } finally { setSaving(false) }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card glass" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>✏️ Edit Transaction</h2>
          <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Date</span>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp} /></label>
            <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Amount</span>
              <input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inp} /></label>
          </div>
          <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Category</span>
            <CategorySelect value={form.category} onChange={(v) => setForm({ ...form, category: v })} cats={cats} /></label>
          {form.category === 'Debt Repayment' && debts.length > 0 && (
            <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Which debt?</span>
              <select value={debts.some((d) => d.name === form.description) ? form.description : ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })} style={inp}>
                <option value="">— pick a debt (fills description) —</option>
                {debts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select></label>
          )}
          <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Description</span>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inp} /></label>
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ justifyContent: 'center' }}>
            {saving ? 'Saving…' : '💾 Save Changes'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  )
}

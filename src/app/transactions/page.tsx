'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Trash2, Search, Tag } from 'lucide-react'
import HeaderNav from '@/components/HeaderNav'
import VersionStamp from '@/components/VersionStamp'
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
  const [editId, setEditId] = useState<string | null>(null)

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

  const recategorize = async (id: string, category: string) => {
    const cat = cats.find((c) => c.name === category)
    const res = await fetch('/api/transactions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, category }),
    })
    if (res.ok) {
      setTxns((prev) => prev.map((t) => t.id === id ? { ...t, category, type: (cat?.type as any) || t.type } : t))
      setEditId(null)
    } else alert('Could not update category.')
  }

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
                      {editId === t.id ? (
                        <select autoFocus value={t.category || ''} onChange={(e) => recategorize(t.id, e.target.value)} onBlur={() => setEditId(null)}
                          style={{ marginTop: 4, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 12 }}>
                          {cats.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                        </select>
                      ) : (
                        <div className="stat-label">{t.date} · {t.category}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span className={`stat-value ${t.type}`} style={{ fontSize: 16 }}>
                        {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}
                      </span>
                      <button onClick={() => setEditId(editId === t.id ? null : t.id)} aria-label="Change category" title="Change category"
                        style={{ display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Tag size={16} />
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
        <VersionStamp page="transactions page" />
      </div>
    </div>
  )
}

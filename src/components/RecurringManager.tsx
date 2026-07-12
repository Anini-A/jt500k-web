'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import CategorySelect from './CategorySelect'
import { getJSON } from '@/lib/fresh'

interface Rec { id: string; name: string; type: string; category: string; amount: number; description: string | null; active: boolean }

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
const inp: React.CSSProperties = {
  height: 40, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%', fontFamily: 'inherit', boxSizing: 'border-box',
}

export default function RecurringManager() {
  const [recs, setRecs] = useState<Rec[]>([])
  const [cats, setCats] = useState<{ name: string; type: string }[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await getJSON('/api/recurring').catch(() => [])
    if (Array.isArray(d)) setRecs(d)
  }, [])
  useEffect(() => {
    load()
    getJSON('/api/categories').then((d) => Array.isArray(d) && setCats(d)).catch(() => {})
  }, [load])

  const act = async (method: string, body?: any, qs = '') => {
    const res = await fetch('/api/recurring' + qs, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    if (res.ok) { await load(); return true }
    alert('Error: ' + ((await res.json()).error || 'failed')); return false
  }

  return (
    <div className="card glass">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>🔁 Recurring</h2>
        <button className="btn btn-secondary" onClick={() => { setAdding((v) => !v); setEditing(null) }}><Plus size={16} /> {adding ? 'Cancel' : 'Add'}</button>
      </div>
      <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 0, marginBottom: 12 }}>
        Define what repeats monthly (rent, subs, paychecks…). Then use ➕ Add Transaction → <strong>Recurring</strong> to log them all in one tap.
      </p>

      {adding && <RecForm cats={cats} onDone={async (p) => { if (await act('POST', p)) setAdding(false) }} onCancel={() => setAdding(false)} />}

      {recs.length === 0 && !adding ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>No recurring items yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 2 }}>
          {recs.map((r) => editing === r.id ? (
            <RecForm key={r.id} rec={r} cats={cats}
              onDone={async (p) => { if (await act('PATCH', { id: r.id, ...p })) setEditing(null) }}
              onDelete={async () => { if (confirm(`Delete "${r.name}"?`)) { if (await act('DELETE', undefined, `?id=${r.id}`)) setEditing(null) } }}
              onCancel={() => setEditing(null)} />
          ) : (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{r.category}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span className={`stat-value ${r.type}`} style={{ fontSize: 15 }}>{money(r.amount)}</span>
                <button onClick={() => { setEditing(r.id); setAdding(false) }} style={{ display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><Pencil size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RecForm({ rec, cats, onDone, onDelete, onCancel }: {
  rec?: Rec; cats: { name: string; type: string }[]
  onDone: (p: any) => void; onDelete?: () => void; onCancel?: () => void
}) {
  const [name, setName] = useState(rec?.name ?? '')
  const [type, setType] = useState(rec?.type ?? 'expense')
  const [category, setCategory] = useState(rec?.category ?? '')
  const [amount, setAmount] = useState(rec ? String(rec.amount) : '')
  const [description, setDescription] = useState(rec?.description ?? '')
  return (
    <div className="card" style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', display: 'grid', gap: 10, margin: rec ? '4px 0' : '0 0 12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Name</span>
          <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Type</span>
          <select style={inp} value={type} onChange={(e) => { setType(e.target.value); setCategory('') }}>
            <option value="income">Income</option><option value="expense">Expense</option><option value="savings">Savings</option>
          </select></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Category</span>
          <CategorySelect value={category} onChange={setCategory} cats={cats.filter((c) => c.type === type)} /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Amount</span>
          <input style={inp} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
      </div>
      <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Description (optional)</span>
        <input style={inp} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Rent July" /></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!name.trim() || !category || !parseFloat(amount)} onClick={() => onDone({ name: name.trim(), type, category, amount: parseFloat(amount), description })}>💾 {rec ? 'Save' : 'Add'}</button>
        {onCancel && <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
        {onDelete && <button className="btn btn-secondary" style={{ color: 'var(--expense)', borderColor: 'var(--expense)' }} onClick={onDelete}><Trash2 size={14} /> Delete</button>}
      </div>
    </div>
  )
}

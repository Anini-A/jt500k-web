'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import CategorySelect from './CategorySelect'
import { getJSON } from '@/lib/fresh'

interface Txn {
  id: string
  date: string
  type: string
  category: string | null
  description: string | null
  amount: number
}

const inp: React.CSSProperties = {
  height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

// Self-contained edit modal — loads its own categories + debts.
export default function EditTransactionModal({ tx, onClose, onSaved }: {
  tx: Txn
  onClose: () => void
  onSaved: () => void
}) {
  const [cats, setCats] = useState<{ name: string; type: string }[]>([])
  const [debts, setDebts] = useState<{ name: string }[]>([])
  const [form, setForm] = useState({
    date: tx.date,
    category: tx.category || '',
    amount: String(tx.amount),
    description: tx.description || '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getJSON('/api/categories').then((d) => Array.isArray(d) && setCats(d)).catch(() => {})
    getJSON('/api/debts').then((d) => Array.isArray(d) && setDebts(d)).catch(() => {})
  }, [])

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

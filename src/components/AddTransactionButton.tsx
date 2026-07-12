'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import IconPill from './IconPill'
import { getJSON } from '@/lib/fresh'

interface Category { name: string; type: string }

const inp: React.CSSProperties = {
  height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

// Header "Add Transaction" pill that opens a modal. Works on any page.
export default function AddTransactionButton() {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cats, setCats] = useState<Category[]>([])
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10), type: 'expense', category: '', amount: '', description: '',
  })

  useEffect(() => {
    if (open && cats.length === 0) {
      getJSON('/api/categories').then((d) => Array.isArray(d) && setCats(d)).catch(() => {})
    }
  }, [open, cats.length])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      })
      if (res.ok) {
        setOpen(false)
        // let any listening page refresh; fall back to reload
        window.dispatchEvent(new CustomEvent('transaction-added'))
        setForm({ ...form, amount: '', description: '' })
      } else {
        alert('Error: ' + ((await res.json()).error || 'could not save'))
      }
    } finally { setSaving(false) }
  }

  const catsForType = cats.filter((c) => c.type === form.type)

  return (
    <>
      <IconPill icon={<Plus />} label="Add Transaction" accent onClick={() => setOpen(true)} />

      {open && createPortal(
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-card glass" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>➕ Add Transaction</h2>
              <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setOpen(false)}>✕</button>
            </div>
            <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Date</span>
                  <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp} /></label>
                <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Type</span>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, category: '' })} style={inp}>
                    <option value="income">Income</option><option value="expense">Expense</option><option value="savings">Savings</option>
                  </select></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Category</span>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inp}>
                    <option value="">— select —</option>
                    {catsForType.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select></label>
                <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Amount</span>
                  <input type="number" step="0.01" required placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inp} /></label>
              </div>
              <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Description</span>
                <input type="text" placeholder="e.g. Groceries" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inp} /></label>
              <button className="btn btn-primary" type="submit" disabled={saving} style={{ justifyContent: 'center' }}>
                {saving ? 'Saving…' : '💾 Save Transaction'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

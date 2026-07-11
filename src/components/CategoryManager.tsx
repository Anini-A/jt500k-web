'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'

interface Cat { id: string; name: string; type: string; color: string | null; count: number; total: number }

const TYPES = ['income', 'expense', 'savings'] as const
const TYPE_LABEL: Record<string, string> = { income: '🟩 Income', expense: '🟧 Expense', savings: '🟪 Savings' }
const DEFAULT_COLOR: Record<string, string> = { income: '#1baf7a', expense: '#eb6834', savings: '#6366f1' }
const money = (n: number) => '$' + Math.round(n).toLocaleString()

const inp: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14,
}

export default function CategoryManager() {
  const [cats, setCats] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch('/api/categories?counts=1').then((r) => r.json()).catch(() => [])
    if (Array.isArray(d)) setCats(d)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (payload: any) => {
    setBusy(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Failed'); return false }
      await load()
      window.dispatchEvent(new CustomEvent('transaction-added')) // nudge other views
      return true
    } finally { setBusy(false) }
  }

  return (
    <div className="card glass">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Categories</h3>
        <button className="btn btn-secondary" onClick={() => { setAdding((v) => !v); setEditing(null) }}>
          <Plus size={16} /> {adding ? 'Cancel' : 'Add'}
        </button>
      </div>

      {adding && <AddForm onDone={async (p) => { if (await act({ action: 'create', ...p })) setAdding(false) }} busy={busy} />}

      {loading ? <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div> : TYPES.map((type) => {
        const group = cats.filter((c) => c.type === type)
        if (!group.length) return null
        return (
          <div key={type} style={{ marginTop: 16 }}>
            <div className="stat-label" style={{ marginBottom: 6 }}>{TYPE_LABEL[type]}</div>
            <div style={{ display: 'grid', gap: 2 }}>
              {group.map((c) => editing === c.id ? (
                <EditRow key={c.id} cat={c} others={cats.filter((x) => x.id !== c.id)} busy={busy}
                  onSave={(p) => act({ action: 'update', id: c.id, ...p }).then((ok) => ok && setEditing(null))}
                  onReassign={(toId) => act({ action: 'reassign', fromId: c.id, toId })}
                  onDelete={(reassignTo) => act({ action: 'delete', id: c.id, reassignTo }).then((ok) => ok && setEditing(null))}
                  onCancel={() => setEditing(null)} />
              ) : (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color || DEFAULT_COLOR[type], flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{c.count} tx · {money(c.total)}</div>
                  </div>
                  <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => { setEditing(c.id); setAdding(false) }}>
                    <Pencil size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AddForm({ onDone, busy }: { onDone: (p: any) => void; busy: boolean }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('expense')
  const [color, setColor] = useState(DEFAULT_COLOR.expense)
  return (
    <div className="card" style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Name</span>
          <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bank Fees" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Type</span>
          <select style={inp} value={type} onChange={(e) => { setType(e.target.value); setColor(DEFAULT_COLOR[e.target.value]) }}>
            <option value="income">Income</option><option value="expense">Expense</option><option value="savings">Savings</option>
          </select></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Color</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ ...inp, padding: 4, width: 48, height: 40 }} /></label>
      </div>
      <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => onDone({ name, type, color })}>Add category</button>
    </div>
  )
}

function EditRow({ cat, others, busy, onSave, onReassign, onDelete, onCancel }: {
  cat: Cat; others: Cat[]; busy: boolean
  onSave: (p: any) => void; onReassign: (toId: string) => void; onDelete: (reassignTo?: string) => void; onCancel: () => void
}) {
  const [name, setName] = useState(cat.name)
  const [type, setType] = useState(cat.type)
  const [color, setColor] = useState(cat.color || DEFAULT_COLOR[cat.type])
  const [moveTo, setMoveTo] = useState('')

  return (
    <div className="card" style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', display: 'grid', gap: 10, marginBottom: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Name</span>
          <input style={inp} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Type</span>
          <select style={inp} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="income">Income</option><option value="expense">Expense</option><option value="savings">Savings</option>
          </select></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Color</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ ...inp, padding: 4, width: 48, height: 40 }} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => onSave({ name, type, color })}>💾 Save</button>
        <button className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>

      {/* Reassign / delete */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 8 }}>
        <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
          Move all {cat.count} transactions to another category, or delete this one.
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={inp} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">— choose category —</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.type})</option>)}
          </select>
          <button className="btn btn-secondary" disabled={busy || !moveTo} onClick={() => onReassign(moveTo)}>Move all here</button>
          <button className="btn btn-secondary" disabled={busy}
            style={{ color: 'var(--expense)', borderColor: 'var(--expense)' }}
            onClick={() => {
              if (cat.count > 0 && !moveTo) { alert('This category has transactions — choose a category to move them to first.'); return }
              if (confirm(`Delete "${cat.name}"?`)) onDelete(moveTo || undefined)
            }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}

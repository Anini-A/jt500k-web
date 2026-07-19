'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, Banknote, CheckCircle2 } from 'lucide-react'
import SectionTitle from './SectionTitle'
import { getJSON } from '@/lib/fresh'

interface Debt {
  id: string
  name: string
  amount: number
  paid: number
  remaining: number
  payments: number
  lastPayment: string | null
}

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const money2 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })

const inp: React.CSSProperties = {
  height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

export default function DebtManager() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const load = useCallback(async () => {
    const d = await getJSON('/api/debts').catch(() => [])
    if (Array.isArray(d)) setDebts(d)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const call = async (method: string, body?: any, qs = '') => {
    setBusy(true)
    try {
      const res = await fetch('/api/debts' + qs, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      })
      if (!res.ok) { alert('Error: ' + ((await res.json()).error || 'failed')); return false }
      await load()
      return true
    } finally { setBusy(false) }
  }

  const totalDebt = debts.reduce((s, d) => s + d.amount, 0)
  const totalRemaining = debts.reduce((s, d) => s + d.remaining, 0)
  const totalPaid = debts.reduce((s, d) => s + Math.min(d.paid, d.amount), 0)
  const overallPct = totalDebt > 0 ? (totalPaid / totalDebt) * 100 : 0

  return (
    <div className="card glass">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <button onClick={() => setCollapsed((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 0 }}
          aria-label={collapsed ? 'Expand debts' : 'Collapse debts'} title={collapsed ? 'Expand' : 'Collapse'}>
          <ChevronDown size={20} style={{ transition: 'transform .2s ease', transform: collapsed ? 'rotate(-90deg)' : 'none', opacity: 0.7 }} />
          <SectionTitle icon={Banknote}>Debt Management</SectionTitle>
        </button>
        {!collapsed && (
          <button className="btn btn-secondary" onClick={() => { setAdding((v) => !v); setEditing(null) }}>
            <Plus size={16} /> {adding ? 'Cancel' : 'Add Debt'}
          </button>
        )}
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
        <div>
          <div className="stat-label">Total Remaining</div>
          <div style={{ fontSize: 'clamp(26px, 8vw, 36px)', fontWeight: 700, color: totalRemaining > 0 ? 'var(--expense)' : 'var(--income)' }}>
            {money(totalRemaining)}
          </div>
        </div>
        <div style={{ paddingBottom: 6 }}>
          <div className="stat-label">Paid Off</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--income)' }}>{money(totalPaid)}</div>
        </div>
        <div style={{ paddingBottom: 6 }}>
          <div className="stat-label">Original Total</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{money(totalDebt)}</div>
        </div>
      </div>

      {/* Overall progress */}
      {debts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 12, borderRadius: 999, background: 'var(--kpi-bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ width: `${overallPct}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--expense), var(--income))', transition: 'width .6s ease' }} />
          </div>
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 6 }}>
            {overallPct.toFixed(1)}% of all debt repaid
          </div>
        </div>
      )}

      {!collapsed && (<>
      {/* Add form */}
      {adding && (
        <AddDebtForm busy={busy} onDone={async (p) => { if (await call('POST', p)) setAdding(false) }} />
      )}

      {/* Debt rows */}
      {loading ? (
        <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div>
      ) : debts.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
          No debts tracked yet — add your first one above.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {debts.map((d) => {
            const pct = d.amount > 0 ? Math.min(100, (d.paid / d.amount) * 100) : 0
            const done = d.remaining <= 0
            if (editing === d.id) {
              return <EditDebtForm key={d.id} debt={d} busy={busy}
                onSave={(p) => call('PATCH', { id: d.id, ...p }).then((ok) => ok && setEditing(null))}
                onDelete={() => { if (confirm(`Delete "${d.name}"? (transactions are not affected)`)) call('DELETE', undefined, `?id=${d.id}`).then((ok) => ok && setEditing(null)) }}
                onCancel={() => setEditing(null)} />
            }
            return (
              <div key={d.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.name} {done && <CheckCircle2 size={14} color="var(--income)" style={{ verticalAlign: -2 }} />}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, color: done ? 'var(--income)' : 'var(--expense)' }}>
                      {done ? 'Paid off!' : `${money2(d.remaining)} left`}
                    </span>
                    <button onClick={() => { setEditing(d.id); setAdding(false) }} aria-label="Edit debt" title="Edit debt"
                      style={{ display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: 'var(--kpi-bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 999, transition: 'width .6s ease',
                    background: done ? 'var(--income)' : 'linear-gradient(90deg, var(--savings), var(--income))',
                  }} />
                </div>
                <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 6 }}>
                  {pct.toFixed(0)}% · paid {money2(Math.min(d.paid, d.amount))} of {money2(d.amount)}
                  {d.payments > 0 ? ` · ${d.payments} payment${d.payments > 1 ? 's' : ''}` : ''}
                  {d.lastPayment ? ` · last ${d.lastPayment}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 16, marginBottom: 0 }}>
        A payment counts toward a debt when its category is <strong>Debt Repayment</strong> and its description
        matches the debt name — the Add Transaction form fills this in for you when you pick a debt.
      </p>
      </>)}
    </div>
  )
}

function AddDebtForm({ busy, onDone }: { busy: boolean; onDone: (p: { name: string; amount: number }) => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  return (
    <div className="card" style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', display: 'grid', gap: 10, marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Debt name</span>
          <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. JH Margin - Water heater" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Balance ($)</span>
          <input style={inp} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
      </div>
      <button className="btn btn-primary" disabled={busy || !name.trim() || !parseFloat(amount)}
        onClick={() => onDone({ name: name.trim(), amount: parseFloat(amount) })}>Add debt</button>
    </div>
  )
}

function EditDebtForm({ debt, busy, onSave, onDelete, onCancel }: {
  debt: Debt; busy: boolean
  onSave: (p: { name: string; amount: number }) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(debt.name)
  const [amount, setAmount] = useState(String(debt.amount))
  return (
    <div className="card" style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', display: 'grid', gap: 10, margin: '8px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Debt name</span>
          <input style={inp} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Balance ($)</span>
          <input style={inp} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => onSave({ name: name.trim(), amount: parseFloat(amount) })}>Save</button>
        <button className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="btn btn-secondary" disabled={busy} style={{ color: 'var(--expense)', borderColor: 'var(--expense)' }} onClick={onDelete}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: 0 }}>
        Renaming changes which payments match — existing payment descriptions stay as they are.
      </p>
    </div>
  )
}

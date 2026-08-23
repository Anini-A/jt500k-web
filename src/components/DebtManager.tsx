'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Pencil, Trash2, ChevronDown, CheckCircle2 } from 'lucide-react'
import { getJSON } from '@/lib/fresh'
import { useConfirm, useToast } from './Feedback'

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
  const { confirm, confirmNode } = useConfirm()
  const { toast, toastNode } = useToast()
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [showPaid, setShowPaid] = useState(false)

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
      if (!res.ok) { toast((await res.json()).error || 'Could not save.'); return false }
      await load()
      return true
    } finally { setBusy(false) }
  }

  const totalDebt = debts.reduce((s, d) => s + d.amount, 0)
  const totalRemaining = debts.reduce((s, d) => s + d.remaining, 0)
  const totalPaid = debts.reduce((s, d) => s + Math.min(d.paid, d.amount), 0)
  const overallPct = totalDebt > 0 ? (totalPaid / totalDebt) * 100 : 0

  const activeDebts = debts.filter((d) => d.remaining > 0).sort((a, b) => b.remaining - a.remaining)
  const paidDebts = debts.filter((d) => d.remaining <= 0).sort((a, b) => a.name.localeCompare(b.name))

  // one debt row — shared by the active list and the (hidden) paid-off list
  const renderDebt = (d: Debt) => {
    const pct = d.amount > 0 ? Math.min(100, (d.paid / d.amount) * 100) : 0
    const done = d.remaining <= 0
    if (editing === d.id) {
      return <EditDebtForm key={d.id} debt={d} busy={busy}
        onSave={(p) => call('PATCH', { id: d.id, ...p }).then((ok) => ok && setEditing(null))}
        onDelete={() => confirm({ title: `Delete “${d.name}”?`, message: 'Transactions are not affected.', run: () => { call('DELETE', undefined, `?id=${d.id}`).then((ok) => ok && setEditing(null)) } })}
        onCancel={() => setEditing(null)} />
    }
    return (
      <div key={d.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)', opacity: done ? 0.72 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.name} {done && <CheckCircle2 size={14} color="var(--income)" style={{ verticalAlign: -2 }} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontWeight: 700, color: done ? 'var(--income)' : 'var(--expense)' }}>
              {done ? 'Paid off' : `${money2(d.remaining)} left`}
            </span>
            <button onClick={() => { setEditing(d.id); setAdding(false) }} aria-label="Edit debt" title="Edit debt"
              style={{ display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <Pencil size={15} />
            </button>
          </div>
        </div>
        {!done && (
          <div style={{ height: 10, borderRadius: 999, background: 'var(--kpi-bg)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, transition: 'width .6s ease', background: 'linear-gradient(90deg, var(--savings), var(--income))' }} />
          </div>
        )}
        <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {done
            ? `${money2(Math.min(d.paid, d.amount))} paid off`
            : `${pct.toFixed(0)}% · paid ${money2(Math.min(d.paid, d.amount))} of ${money2(d.amount)}`}
          {d.payments > 0 ? ` · ${d.payments} payment${d.payments > 1 ? 's' : ''}` : ''}
          {d.lastPayment ? ` · last ${d.lastPayment}` : ''}
        </div>
      </div>
    )
  }

  return (
    <div className="card glass">
      {confirmNode}{toastNode}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <span className="hdr-label">Debt Management</span>
      </div>

      {/* Summary — three equal stats spread across the full width */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        <div style={{ textAlign: 'left' }}>
          <div className="stat-label">Remaining</div>
          <div style={{ fontSize: 'clamp(20px, 5.5vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: totalRemaining > 0 ? 'var(--expense)' : 'var(--income)' }}>{money(totalRemaining)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="stat-label">Paid Off</div>
          <div style={{ fontSize: 'clamp(20px, 5.5vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--income)' }}>{money(totalPaid)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat-label">Original</div>
          <div style={{ fontSize: 'clamp(20px, 5.5vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{money(totalDebt)}</div>
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

      {/* bottom-right collapse toggle — same design as the money-flow card */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {debts.length > 0 ? `${debts.length} ${debts.length === 1 ? 'debt' : 'debts'}${paidDebts.length ? ` · ${paidDebts.length} paid` : ''}` : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={() => { setAdding(true); setEditing(null) }} aria-label="Add debt" title="Add debt"
            style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <Plus size={16} />
          </button>
          <button onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed} aria-label={collapsed ? 'Show debts' : 'Hide debts'} title={collapsed ? 'Show debts' : 'Hide debts'}
            style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <ChevronDown size={16} style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform .2s ease' }} />
          </button>
        </div>
      </div>

      {/* Add debt — popup form */}
      {adding && createPortal(
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <div className="modal-card glass" style={{ width: 'min(480px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Add debt</h2>
              <button className="modal-x" aria-label="Close" onClick={() => setAdding(false)}>✕</button>
            </div>
            <AddDebtForm busy={busy} onDone={async (p) => { if (await call('POST', p)) setAdding(false) }} />
          </div>
        </div>,
        document.body
      )}

      {!collapsed && (<>
      <div style={{ marginTop: 16 }} />
      {/* Debt rows — active first; paid-off hidden behind a toggle */}
      {loading ? (
        <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div>
      ) : debts.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
          No debts tracked yet — add your first one above.
        </div>
      ) : (
        <>
          {activeDebts.length > 0
            ? <div style={{ display: 'grid', gap: 4 }}>{activeDebts.map(renderDebt)}</div>
            : <div style={{ padding: '18px 0 6px', textAlign: 'center', color: 'var(--income)', fontWeight: 700 }}>🎉 Every debt paid off</div>}

          {paidDebts.length > 0 && (
            <>
              <button onClick={() => setShowPaid((v) => !v)} aria-expanded={showPaid}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center', marginTop: 4, padding: '10px 0', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
                <CheckCircle2 size={14} color="var(--income)" />
                {showPaid ? 'Hide paid off' : `Show ${paidDebts.length} paid off`}
                <ChevronDown size={14} style={{ transform: showPaid ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
              </button>
              {showPaid && <div style={{ display: 'grid', gap: 4 }}>{paidDebts.map(renderDebt)}</div>}
            </>
          )}
        </>
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
    <div style={{ display: 'grid', gap: 10 }}>
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

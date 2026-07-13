'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react'
import CategorySelect from './CategorySelect'
import { getJSON } from '@/lib/fresh'

interface Item { id: string; name: string; amount: number }
interface Envelope { category: string; type: string; budgeted: number; spent: number; items: Item[] }

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const money2 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })

const inp: React.CSSProperties = {
  height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

// For expenses, going over budget is bad. For savings/debt, meeting/beating is good.
// Colour is kept deliberately quiet: every bar shares one neutral fill, and only a
// genuine problem (over budget) turns red — so a long list reads calm, not rainbow.
const BAR_BASE = 'linear-gradient(90deg, var(--savings), var(--income))'
function envStatus(e: Envelope) {
  const good = e.type === 'savings' || (e.category === 'Debt Repayment')
  const pct = e.budgeted > 0 ? e.spent / e.budgeted : 0
  const remaining = e.budgeted - e.spent
  const over = !good && pct > 1
  const met = good && pct >= 1
  let note: string
  if (good) {
    note = pct >= 1 ? `target met${e.spent > e.budgeted ? ` (+${money(e.spent - e.budgeted)})` : ''}` : `${money(remaining)} to go`
  } else {
    note = remaining >= 0 ? `${money(remaining)} left` : `over by ${money(-remaining)}`
  }
  // fill: one neutral colour for everything; red only when over budget
  const fill = over ? 'var(--expense)' : BAR_BASE
  // note ink: red when over, green when a good target is met, muted otherwise
  const noteColor = over ? 'var(--expense)' : met ? 'var(--income)' : 'var(--text-muted)'
  return { pct: Math.min(100, pct * 100), fill, note, noteColor, over }
}

export default function BudgetManager() {
  const [data, setData] = useState<{ month: string; label: string; envelopes: Envelope[]; totalBudgeted: number; totalSpent: number } | null>(null)
  const [cats, setCats] = useState<{ name: string; type: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const d = await getJSON('/api/budgets').catch(() => null)
    if (d && !d.error) setData(d)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    getJSON('/api/categories').then((d) => Array.isArray(d) && setCats(d)).catch(() => {})
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const call = async (method: string, body?: any, qs = '') => {
    setBusy(true)
    try {
      const res = await fetch('/api/budgets' + qs, {
        method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      })
      if (!res.ok) { alert('Error: ' + ((await res.json()).error || 'failed')); return false }
      await load()
      return true
    } finally { setBusy(false) }
  }

  const toggle = (c: string) => setExpanded((prev) => {
    const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n
  })

  const envelopes = data?.envelopes ?? []

  // Money "set aside" (savings + debt repayment) is not money spent — keep it out
  // of the "left to spend" cushion so a debt overpayment doesn't read as a blowout.
  const isSetAside = (e: Envelope) => e.type === 'savings' || e.category === 'Debt Repayment'
  const sum = (arr: Envelope[], k: 'budgeted' | 'spent') => arr.reduce((s, e) => s + e[k], 0)
  const expEnvs = envelopes.filter((e) => !isSetAside(e))
  const setEnvs = envelopes.filter(isSetAside)
  const expBudgeted = sum(expEnvs, 'budgeted')
  const expSpent = sum(expEnvs, 'spent')
  const setBudgeted = sum(setEnvs, 'budgeted')
  const setDone = sum(setEnvs, 'spent')
  const overallPct = expBudgeted > 0 ? Math.min(100, (expSpent / expBudgeted) * 100) : 0
  const leftover = expBudgeted - expSpent

  // Calendar pacing: how far through the tracking month we are (marker on the bars).
  const pace = (() => {
    if (!data?.month || !/^\d{4}-\d{2}$/.test(data.month)) return 100
    const [yy, mm] = data.month.split('-').map(Number)
    const now = new Date()
    const dim = new Date(yy, mm, 0).getDate()
    const day = now.getFullYear() === yy && now.getMonth() + 1 === mm ? now.getDate() : dim
    return Math.round((day / dim) * 100)
  })()

  return (
    <>
      {/* ── Card 1: summary (always visible) ── */}
      <div className="card glass" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 16px' }}>🎯 Monthly Budget</h2>

        {/* Three uniform stats — expenses only (savings/debt shown separately below) */}
        <div className="stat-grid" style={{ marginBottom: 12 }}>
          <div className="stat-card">
            <div className="stat-label">{leftover >= 0 ? 'Left to spend' : 'Over budget'}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: leftover >= 0 ? 'var(--income)' : 'var(--expense)' }}>{money(Math.abs(leftover))}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Spent</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{money(expSpent)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Budgeted</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{money(expBudgeted)}</div>
          </div>
        </div>
        {expEnvs.length > 0 && (
          <div>
            <Bar pct={overallPct} pace={pace} fill="linear-gradient(90deg, var(--savings), var(--income))" height={12} />
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 6 }}>
              {overallPct.toFixed(0)}% of the spending plan used · {pace}% through {data?.label ?? 'the month'}
            </div>
          </div>
        )}
        {setEnvs.length > 0 && (
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            🏦 Set aside this month: <strong style={{ color: 'var(--savings)' }}>{money(setDone)}</strong> of {money(setBudgeted)} planned <span style={{ color: 'var(--text-muted)' }}>· savings + debt (kept, not spent)</span>
          </div>
        )}
      </div>

      {/* ── Card 2: the individual items (collapsible) ── */}
      <div className="card glass">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : 16, gap: 8 }}>
          <button onClick={() => setCollapsed((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 0 }}
            aria-label={collapsed ? 'Expand budget items' : 'Collapse budget items'}>
            <ChevronDown size={20} style={{ transition: 'transform .2s ease', transform: collapsed ? 'rotate(-90deg)' : 'none', opacity: 0.7 }} />
            <h2 style={{ margin: 0 }}>📋 Budget Items</h2>
          </button>
          {!collapsed && (
            <button className="btn btn-secondary" onClick={() => { setAdding((v) => !v); setEditing(null) }}>
              <Plus size={16} /> {adding ? 'Cancel' : 'Add Item'}
            </button>
          )}
        </div>

      {!collapsed && (<>
        {adding && (
          <ItemForm cats={cats} busy={busy} onDone={async (p) => { if (await call('POST', p)) setAdding(false) }} />
        )}

        {loading ? (
          <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div>
        ) : envelopes.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No budget yet — add your first item above.</div>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {envelopes.map((e) => {
              const s = envStatus(e)
              const open = expanded.has(e.category)
              return (
                <div key={e.category} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <button onClick={() => toggle(e.category)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 0, fontWeight: 600, minWidth: 0 }}>
                      <ChevronDown size={15} style={{ transition: 'transform .2s ease', transform: open ? 'none' : 'rotate(-90deg)', opacity: 0.55, flexShrink: 0 }} />
                      <span style={{ fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.category}</span>
                      <span className="stat-label" style={{ flexShrink: 0 }}>({e.items.length})</span>
                    </button>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{money(e.spent)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {money(e.budgeted)}</span></div>
                      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, color: s.noteColor }}>{s.note}</div>
                    </div>
                  </div>
                  <Bar pct={s.pct} pace={isSetAside(e) ? null : pace} fill={s.fill} height={6} />

                  {open && (
                    <div style={{ display: 'grid', gap: 4, marginTop: 10, paddingLeft: 21 }}>
                      {e.items.map((it) => editing === it.id ? (
                        <ItemForm key={it.id} cats={cats} busy={busy} item={{ ...it, category: e.category }}
                          onDone={async (p) => { if (await call('PATCH', { id: it.id, ...p })) setEditing(null) }}
                          onDelete={async () => { if (confirm(`Delete "${it.name}"?`)) { if (await call('DELETE', undefined, `?id=${it.id}`)) setEditing(null) } }}
                          onCancel={() => setEditing(null)} />
                      ) : (
                        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{money2(it.amount)}/mo</span>
                            <button onClick={() => { setEditing(it.id); setAdding(false) }} aria-label="Edit" title="Edit"
                              style={{ display: 'inline-flex', padding: 5, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                              <Pencil size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 16, marginBottom: 0 }}>
          💡 Each envelope tracks its budgeted total against your actual {data?.label ?? 'monthly'} activity. The faint vertical tick marks today's pace ({pace}% through the month) — a fill sitting well past it is running ahead of schedule. Expense envelopes turn red when over; savings & debt turn green at target.
        </p>
      </>)}
      </div>
    </>
  )
}

// Progress bar with an optional "today's pace" marker — a thin vertical tick at the
// point of the month we've reached, so fill past the tick = ahead of pace.
function Bar({ pct, pace, fill, height }: { pct: number; pace: number | null; fill: string; height: number }) {
  return (
    <div style={{ position: 'relative', height, borderRadius: 999, background: 'var(--kpi-bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: fill, transition: 'width .6s ease' }} />
      {pace != null && pace > 0 && pace < 100 && (
        <div title={`Today — ${pace}% through the month`}
          style={{ position: 'absolute', top: -1, bottom: -1, left: `${pace}%`, width: 2, background: 'var(--text-primary)', opacity: 0.4 }} />
      )}
    </div>
  )
}

function ItemForm({ cats, busy, item, onDone, onDelete, onCancel }: {
  cats: { name: string; type: string }[]
  busy: boolean
  item?: { name: string; category: string; amount: number }
  onDone: (p: { name: string; category: string; amount: number }) => void
  onDelete?: () => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState(item?.category ?? '')
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  return (
    <div className="card" style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', display: 'grid', gap: 10, margin: item ? '4px 0' : '0 0 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Item</span>
          <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mortgage" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Category</span>
          <CategorySelect value={category} onChange={setCategory} cats={cats} /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Monthly ($)</span>
          <input style={inp} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy || !name.trim() || !category || !parseFloat(amount)}
          onClick={() => onDone({ name: name.trim(), category, amount: parseFloat(amount) })}>💾 {item ? 'Save' : 'Add item'}</button>
        {onCancel && <button className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>}
        {onDelete && <button className="btn btn-secondary" disabled={busy} style={{ color: 'var(--expense)', borderColor: 'var(--expense)' }} onClick={onDelete}><Trash2 size={14} /> Delete</button>}
      </div>
    </div>
  )
}

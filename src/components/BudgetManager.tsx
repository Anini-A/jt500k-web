'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, Wallet, CreditCard, PiggyBank, Banknote, Target, ClipboardList, type LucideIcon } from 'lucide-react'
import CategorySelect from './CategorySelect'
import SectionTitle from './SectionTitle'
import { today } from '@/lib/date'
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
  const [data, setData] = useState<{ month: string; label: string; availableMonths?: string[]; envelopes: Envelope[]; totalBudgeted: number; totalSpent: number } | null>(null)
  const [cats, setCats] = useState<{ name: string; type: string }[]>([])
  const [month, setMonth] = useState(today().slice(0, 7)) // current local month
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [groupFilter, setGroupFilter] = useState('all') // 'all' | group key
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const d = await getJSON(`/api/budgets?month=${month}`).catch(() => null)
    if (d && !d.error) setData(d)
    setLoading(false)
  }, [month])

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


  const envelopes = data?.envelopes ?? []

  // Savings & debt repayment are money kept, not spent — so the summary splits into
  // four independent groups instead of one blended cushion.
  const isSetAside = (e: Envelope) => e.type === 'savings' || e.category === 'Debt Repayment'
  const sum = (arr: Envelope[], k: 'budgeted' | 'spent') => arr.reduce((s, e) => s + e[k], 0)
  const groups = [
    { key: 'income', icon: Wallet as LucideIcon, label: 'Income', color: 'var(--income)', soft: 'var(--income-soft)', goodUp: true, paced: true,
      envs: envelopes.filter((e) => e.type === 'income') },
    { key: 'spending', icon: CreditCard as LucideIcon, label: 'Spending', color: 'var(--savings)', soft: 'var(--savings-soft)', goodUp: false, paced: true,
      envs: envelopes.filter((e) => e.type === 'expense' && e.category !== 'Debt Repayment') },
    { key: 'saving', icon: PiggyBank as LucideIcon, label: 'Saving', color: 'var(--savings)', soft: 'var(--savings-soft)', goodUp: true, paced: false,
      envs: envelopes.filter((e) => e.type === 'savings') },
    { key: 'debt', icon: Banknote as LucideIcon, label: 'Debt Repayment', color: '#c2892f', soft: 'rgba(224,161,43,0.16)', goodUp: true, paced: false,
      envs: envelopes.filter((e) => e.category === 'Debt Repayment') },
  ].map((g) => ({ ...g, budgeted: sum(g.envs, 'budgeted'), actual: sum(g.envs, 'spent') }))

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <SectionTitle icon={Target}>Monthly Budget</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{pace}% through</span>
            <select className="date-input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Budget month" style={{ fontWeight: 600 }}>
              {[...new Set([month, ...(data?.availableMonths ?? [])])].sort().reverse().map((m) => {
                const [y, mo] = m.split('-')
                return <option key={m} value={m}>{new Date(Number(y), Number(mo) - 1).toLocaleString('en', { month: 'long', year: 'numeric' })}</option>
              })}
            </select>
          </div>
        </div>

        {/* Four independent group bars: income · spending · saving · debt */}
        <div style={{ display: 'grid', gap: 16 }}>
          {groups.map((g) => (
            <GroupBar key={g.key} icon={g.icon} label={g.label} color={g.color}
              budgeted={g.budgeted} actual={g.actual} goodUp={g.goodUp}
              pace={pace} />
          ))}
        </div>
      </div>

      {/* ── Card 2: the individual items (collapsible) ── */}
      <div className="card glass">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : 16, gap: 8 }}>
          <button onClick={() => setCollapsed((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 0 }}
            aria-label={collapsed ? 'Expand budget items' : 'Collapse budget items'}>
            <ChevronDown size={20} style={{ transition: 'transform .2s ease', transform: collapsed ? 'rotate(-90deg)' : 'none', opacity: 0.7 }} />
            <SectionTitle icon={ClipboardList}>Budget Items</SectionTitle>
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
          <>
            {/* Group selector pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <button className={`chip ${groupFilter === 'all' ? 'chip-active' : ''}`} onClick={() => setGroupFilter('all')}>All</button>
              {groups.filter((g) => g.envs.length > 0).map((g) => {
                const GIcon = g.icon
                return (
                  <button key={g.key} className={`chip ${groupFilter === g.key ? 'chip-active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onClick={() => setGroupFilter(g.key)}><GIcon size={13} /> {g.label}</button>
                )
              })}
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
            {groups.filter((g) => g.envs.length > 0 && (groupFilter === 'all' || groupFilter === g.key)).map((g) => (
              <div key={g.key}>
                {/* Coloured group label — only needed in the 'All' view to separate groups */}
                {groupFilter === 'all' && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <span style={{ background: g.soft, color: g.color, padding: '3px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}><g.icon size={13} /> {g.label}</span>
                    <span className="stat-label" style={{ flexShrink: 0 }}>{money(g.actual)} / {money(g.budgeted)}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gap: 4, paddingLeft: groupFilter === 'all' ? 6 : 0 }}>
                  {g.envs.map((e) => {
              const s = envStatus(e)
              return (
                <div key={e.category} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{e.category}</span>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{money(e.spent)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {money(e.budgeted)}</span></div>
                      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, color: s.noteColor }}>{s.note}</div>
                    </div>
                  </div>
                  <Bar pct={s.pct} pace={pace} fill={s.fill} height={6} />

                  {/* Line items — always shown; tap any row to edit it inline */}
                  <div style={{ display: 'grid', gap: 2, marginTop: 9, paddingLeft: 4 }}>
                    {e.items.map((it) => editing === it.id ? (
                      <ItemForm key={it.id} cats={cats} busy={busy} item={{ ...it, category: e.category }}
                        onDone={async (p) => { if (await call('PATCH', { id: it.id, ...p })) setEditing(null) }}
                        onDelete={async () => { if (confirm(`Delete "${it.name}"?`)) { if (await call('DELETE', undefined, `?id=${it.id}`)) setEditing(null) } }}
                        onCancel={() => setEditing(null)} />
                    ) : (
                      <button key={it.id} onClick={() => { setEditing(it.id); setAdding(false) }} title="Edit"
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '4px 6px', margin: '0 -6px', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', width: 'calc(100% + 12px)', textAlign: 'left', font: 'inherit' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          <Pencil size={12} style={{ opacity: 0.4, flexShrink: 0 }} /> {it.name}
                        </span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{money2(it.amount)}/mo</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
                  })}
                </div>
              </div>
            ))}
            </div>
          </>
        )}

        <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 16, marginBottom: 0 }}>
          Each envelope tracks its budgeted total against your actual {data?.label ?? 'monthly'} activity. The faint vertical tick marks today's pace ({pace}% through the month) — a fill sitting well past it is running ahead of schedule. Expense envelopes turn red when over; savings & debt turn green at target.
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

// One row of the summary: a labelled group (Income / Spending / Saving / Debt) with
// its actual-vs-budget figures, a bar, and a plain-English note.
function GroupBar({ icon: Icon, label, color, budgeted, actual, goodUp, pace }: {
  icon: LucideIcon; label: string; color: string; budgeted: number; actual: number; goodUp: boolean; pace: number | null
}) {
  const pct = budgeted > 0 ? Math.min(100, (actual / budgeted) * 100) : (actual > 0 ? 100 : 0)
  const remaining = budgeted - actual
  const over = !goodUp && remaining < 0
  const met = goodUp && budgeted > 0 && actual >= budgeted
  // Match the budget-item bars: one neutral gradient, red only when over
  const fill = over ? 'var(--expense)' : BAR_BASE

  let note: string
  if (!budgeted && !actual) note = 'not set up yet'
  else if (!budgeted) note = `${money(actual)} so far · no budget set`
  else if (goodUp) note = met ? `target met${actual > budgeted ? ` (+${money(actual - budgeted)})` : ''}` : `${money(remaining)} to go`
  else note = remaining >= 0 ? `${money(remaining)} left` : `over by ${money(-remaining)}`
  const noteColor = over ? 'var(--expense)' : met ? 'var(--income)' : 'var(--text-muted)'

  return (
    <div style={{ opacity: !budgeted && !actual ? 0.55 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
        <span style={{ fontSize: 15, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon size={16} style={{ color }} /> {label}</span>
        <span style={{ flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{money(actual)}</span>
          <span style={{ color: 'var(--text-muted)' }}> / {budgeted ? money(budgeted) : '—'}</span>
        </span>
      </div>
      <Bar pct={pct} pace={pace} fill={fill} height={8} />
      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 5, color: noteColor }}>{note}</div>
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
          onClick={() => onDone({ name: name.trim(), category, amount: parseFloat(amount) })}>{item ? 'Save' : 'Add item'}</button>
        {onCancel && <button className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>}
        {onDelete && <button className="btn btn-secondary" disabled={busy} style={{ color: 'var(--expense)', borderColor: 'var(--expense)' }} onClick={onDelete}><Trash2 size={14} /> Delete</button>}
      </div>
    </div>
  )
}

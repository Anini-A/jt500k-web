'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, Wallet, CreditCard, PiggyBank, Banknote, type LucideIcon } from 'lucide-react'
import CategorySelect from './CategorySelect'
import { today } from '@/lib/date'
import { getJSON } from '@/lib/fresh'
import { useConfirm, useToast } from './Feedback'

interface Item { id: string; name: string; amount: number; debt_name?: string | null }
interface Envelope { category: string; type: string; budgeted: number; spent: number; items: Item[]; lineTotal?: number; budgetSet?: boolean }
// Attribution of the month's debt payments — display only; never feeds a budgeted total.
interface DebtSummary { rows: { name: string; paid: number; done?: boolean }[]; unassigned: number; paidOff: number; unlinkedPlanned: number }

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
const money2 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })

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
  const [data, setData] = useState<{ month: string; label: string; availableMonths?: string[]; envelopes: Envelope[]; monthActuals?: { income: number; outflow: number }; debtSummary?: DebtSummary; totalBudgeted: number; totalSpent: number } | null>(null)
  const [cats, setCats] = useState<{ name: string; type: string }[]>([])
  const [month, setMonth] = useState(today().slice(0, 7)) // current local month
  const { confirm, confirmNode } = useConfirm()
  const { toast, toastNode } = useToast()
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [groupFilter, setGroupFilter] = useState('all') // 'all' | group key
  const [openEnv, setOpenEnv] = useState<Set<string>>(new Set()) // envelopes whose line items are revealed
  // Debt Repayment's budget is typed directly rather than summed from its plan lines —
  // those lines are the rows you tick to log payments, so they can't be rewritten to make
  // a total come out. Blank clears it and the envelope goes back to summing.
  const [editBudget, setEditBudget] = useState<string | null>(null)
  const [budgetDraft, setBudgetDraft] = useState('')
  const saveBudget = async (category: string) => {
    const raw = budgetDraft.trim()
    if (raw !== '' && !(parseFloat(raw) >= 0)) { toast('Enter an amount, or clear the box to go back to summing the lines.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/budgets', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, amount: raw === '' ? null : parseFloat(raw) }),
      })
      if (!res.ok) { toast((await res.json()).error || 'Could not save.'); return }
      setEditBudget(null)
      await load()
    } finally { setBusy(false) }
  }
  const toggleEnv = (cat: string) => setOpenEnv((p) => { const n = new Set(p); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
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
      if (!res.ok) { toast((await res.json()).error || 'Could not save.'); return false }
      await load()
      return true
    } finally { setBusy(false) }
  }


  const envelopes = data?.envelopes ?? []
  const itemCount = envelopes.reduce((n, e) => n + e.items.length, 0)

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

  // ── The two headline figures ───────────────────────────────────────────────
  // Left to spend: income actually RECEIVED minus everything actually spent, saved and
  // repaid. The number to check before saying yes to a purchase. Budgeted income that
  // hasn't landed yet is reported separately rather than folded in, so the figure never
  // promises money that isn't there.
  const income = groups.find((g) => g.key === 'income')!
  // From every transaction in the month, not just the budgeted categories — spending in a
  // category with no budget line is still money out of the account.
  const received = data?.monthActuals?.income ?? income.actual
  const outflow = data?.monthActuals?.outflow ?? groups.filter((g) => g.key !== 'income').reduce((s2, g) => s2 + g.actual, 0)
  const leftToSpend = received - outflow
  // Does the plan balance? Budgeted income against every dollar allocated to a job.
  const allocated = groups.filter((g) => g.key !== 'income').reduce((s2, g) => s2 + g.budgeted, 0)
  const unallocated = income.budgeted - allocated
  const debtSummary = data?.debtSummary
  // A closed month is a record, not a plan in progress: its labels read in the past tense,
  // and the balance check is withheld because budget lines aren't stored per month — the
  // only plan we have is today's, which says nothing true about August.
  const isCurrentMonth = (data?.month ?? month) === today().slice(0, 7)

  return (
    <>
      {confirmNode}{toastNode}
      {/* One card: the month's summary, then its items behind the collapse toggle */}
      <div className="card glass">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <span className="hdr-label">Monthly Budget</span>
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

        {/* The headline, on the same three-stat pattern as Debt Management — the figure
            leads, but at a size that sits inside the card rather than dominating it. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
          {/* Reads as the month's arithmetic, left to right: what came in, what went out,
              what that leaves. */}
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div className="stat-label">Received</div>
            <div style={{ fontSize: 'clamp(20px, 5.5vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--income)' }}>{money(received)}</div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <div className="stat-label">{isCurrentMonth ? 'Out so far' : 'Out'}</div>
            <div style={{ fontSize: 'clamp(20px, 5.5vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{money(outflow)}</div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <div className="stat-label">{isCurrentMonth ? 'Unspent so far' : leftToSpend < 0 ? 'Overspent by' : 'Left over'}</div>
            <div style={{ fontSize: 'clamp(20px, 5.5vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: leftToSpend < 0 ? 'var(--expense)' : 'var(--text-primary)' }}>{money(leftToSpend)}</div>
          </div>
        </div>

        {/* Does the plan fund itself? Caught before the month runs, not after. */}
        {income.budgeted > 0 && isCurrentMonth && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 11, fontSize: 12.5, lineHeight: 1.4,
            background: unallocated < 0 ? 'var(--expense-soft)' : 'var(--income-soft)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: unallocated < 0 ? 'var(--expense)' : 'var(--income)' }} />
            <span>
              {unallocated < 0
                ? <>Plan doesn&rsquo;t balance — over-allocated by <b style={{ fontVariantNumeric: 'tabular-nums' }}>{money(-unallocated)}</b>.</>
                : <>Plan balances — <b style={{ fontVariantNumeric: 'tabular-nums' }}>{money(unallocated)}</b> unallocated.</>}
            </span>
          </div>
        )}

        {/* The four group bars are the breakdown, not the headline */}
        <div style={{ display: 'grid', gap: 16, marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          {groups.map((g) => (
            <GroupBar key={g.key} icon={g.icon} label={g.label} color={g.color}
              budgeted={g.budgeted} actual={g.actual} goodUp={g.goodUp}
              pace={g.paced ? pace : null} />
          ))}
        </div>

      {/* Summary and items are one card, collapsed from the bottom-right — the same
          shape as Debt Management, so the two tabs read as siblings. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 18 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {envelopes.length > 0
            ? `${envelopes.length} ${envelopes.length === 1 ? 'envelope' : 'envelopes'} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`
            : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={() => { setAdding((v) => !v); setEditing(null); setCollapsed(false) }} aria-label={adding ? 'Cancel add item' : 'Add budget item'} title={adding ? 'Cancel' : 'Add budget item'}
            style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <Plus size={16} style={{ transform: adding ? 'rotate(45deg)' : 'none', transition: 'transform .2s ease' }} />
          </button>
          <button onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed} aria-label={collapsed ? 'Show budget items' : 'Hide budget items'} title={collapsed ? 'Show budget items' : 'Hide budget items'}
            style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <ChevronDown size={16} style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform .2s ease' }} />
          </button>
        </div>
      </div>

      {adding && (
        <div style={{ marginTop: 14, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <ItemForm cats={cats} busy={busy} onDone={async (p) => { if (await call('POST', p)) setAdding(false) }} onCancel={() => setAdding(false)} />
        </div>
      )}

      {!collapsed && (<>
        <div style={{ marginTop: 16 }} />

        {loading ? (
          <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div>
        ) : envelopes.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No budget yet — add your first item above.</div>
        ) : (
          <>
            {/* Group selector pills — single-line, scrollable */}
            <div className="chip-scroll" style={{ marginBottom: 16 }}>
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
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{money(e.spent)}{' '}
                        {e.category === 'Debt Repayment' ? (
                          editBudget === e.category ? (
                            <input autoFocus inputMode="decimal" value={budgetDraft} disabled={busy}
                              onChange={(ev) => setBudgetDraft(ev.target.value.replace(/[^0-9.]/g, ''))}
                              onBlur={() => saveBudget(e.category)}
                              onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur(); if (ev.key === 'Escape') setEditBudget(null) }}
                              aria-label="Budgeted amount" placeholder="sum of lines"
                              style={{ ...inp, height: 28, width: 108, display: 'inline-block', textAlign: 'right', fontSize: 15, fontWeight: 600, padding: '0 8px', fontVariantNumeric: 'tabular-nums' }} />
                          ) : (
                            <button onClick={() => { setBudgetDraft(e.budgetSet ? String(e.budgeted) : ''); setEditBudget(e.category) }}
                              title="Edit the budgeted amount"
                              style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed var(--text-muted)', borderRadius: 0, padding: '0 1px', font: 'inherit', fontWeight: 400, color: 'var(--text-muted)', cursor: 'pointer' }}>
                              / {money(e.budgeted)}
                            </button>
                          )
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {money(e.budgeted)}</span>
                        )}
                      </div>
                      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, color: s.noteColor }}>{s.note}</div>
                    </div>
                  </div>
                  <Bar pct={s.pct} pace={pace} fill={s.fill} height={6} />

                  {/* Line items — hidden until asked for, so a long budget scans in one pass. */}
                  <button onClick={() => toggleEnv(e.category)} aria-expanded={openEnv.has(e.category)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 9, padding: '3px 7px 3px 0', background: 'none', border: 'none', font: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <ChevronDown size={12} style={{ transition: 'transform .18s ease', transform: openEnv.has(e.category) ? 'none' : 'rotate(-90deg)', opacity: 0.7 }} />
                    {e.category === 'Debt Repayment' && debtSummary
                      ? `paid to ${debtSummary.rows.length} debt${debtSummary.rows.length !== 1 ? 's' : ''}`
                      : `${e.items.length} item${e.items.length !== 1 ? 's' : ''}`}
                  </button>
                  {e.budgetSet && e.lineTotal != null && Math.abs(e.lineTotal - e.budgeted) >= 0.01 && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 8 }}>
                      lines total {money(e.lineTotal)}
                    </span>
                  )}

                  {/* The Debt Repayment envelope keeps ONE budgeted figure and one bar. Its rows
                      attribute the month's payments across the active debts — they carry no
                      balances (that's the Debts page) and never add to what's budgeted. Each row
                      still opens its own plan line for editing where one exists. */}
                  {openEnv.has(e.category) && e.category === 'Debt Repayment' && debtSummary ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, marginTop: 9, paddingLeft: 4 }}>
                      {/* Name and what it got this month, nothing else. The envelope's budget is
                          edited on the total above, so these rows carry no plan amount and open
                          no editor — they're a read-only breakdown of where the money went. */}
                      {debtSummary.rows.map((d) => (
                        <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {d.name}
                            {d.done && <span style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--income)' }}>paid off</span>}
                          </span>
                          <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: d.paid > 0 ? 600 : 400, color: d.paid > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {d.paid > 0 ? money2(d.paid) : '—'}
                          </span>
                        </div>
                      ))}
                      {debtSummary.unassigned > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                          <span>Unassigned <span style={{ color: 'var(--text-muted)' }}>— paid against no debt</span></span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money2(debtSummary.unassigned)}</span>
                        </div>
                      )}
                      {debtSummary.unlinkedPlanned > 0 && (
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--expense)', marginTop: 6 }}>
                          {money(debtSummary.unlinkedPlanned)}/mo of this budget isn&rsquo;t pointed at a debt yet — link it in Add ▸ Recurring.
                        </div>
                      )}
                    </div>
                  ) : openEnv.has(e.category) ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, marginTop: 9, paddingLeft: 4 }}>
                    {e.items.map((it) => editing === it.id ? (
                      <ItemForm key={it.id} cats={cats} busy={busy} item={{ ...it, category: e.category }}
                        onDone={async (p) => { if (await call('PATCH', { id: it.id, ...p })) setEditing(null) }}
                        onDelete={() => confirm({ title: `Delete “${it.name}”?`, run: async () => { if (await call('DELETE', undefined, `?id=${it.id}`)) setEditing(null) } })}
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
                  ) : null}
                </div>
              )
                  })}
                </div>
              </div>
            ))}
            </div>
          </>
        )}

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

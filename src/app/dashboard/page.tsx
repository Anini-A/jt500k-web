'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Wallet, CreditCard, PiggyBank, LineChart, Banknote, Target, Users, Receipt, Pencil, Trash2, type LucideIcon } from 'lucide-react'
import HeaderNav from '@/components/HeaderNav'
import PagePill from '@/components/PagePill'
import Logo from '@/components/Logo'
import DebtManager from '@/components/DebtManager'
import BillRunway from '@/components/BillRunway'
import BudgetManager from '@/components/BudgetManager'
import InvestmentsPanel from '@/components/InvestmentsPanel'
import ProfilePanel from '@/components/ProfilePanel'
import EditTransactionModal from '@/components/EditTransactionModal'
import { getJSON } from '@/lib/fresh'
import { ymd, today } from '@/lib/date'
import { MonthlyArea, HBar, COLORS } from '@/components/DashCharts'

type Tab = 'income' | 'expenses' | 'savings' | 'debts' | 'investments' | 'budget' | 'bills' | 'household'
const TABS: { key: Tab; label: string; Icon: LucideIcon; soon?: boolean }[] = [
  { key: 'budget', label: 'Budget', Icon: Target },
  { key: 'bills', label: 'Bills', Icon: Receipt },
  { key: 'income', label: 'Income', Icon: Wallet },
  { key: 'expenses', label: 'Expenses', Icon: CreditCard },
  { key: 'savings', label: 'Savings', Icon: PiggyBank },
  { key: 'debts', label: 'Debts', Icon: Banknote },
  { key: 'investments', label: 'Investments', Icon: LineChart },
  { key: 'household', label: 'Household', Icon: Users },
]

interface Txn {
  id: string
  date: string
  type: 'income' | 'expense' | 'savings'
  category: string | null
  description: string | null
  amount: number
}

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const money2 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })

type Preset = 'all' | 'ytd' | '12m' | '6m' | 'month' | 'custom'
// Canonical range set, shared across the app.
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'ytd', label: 'YTD' },
  { key: '6m', label: '6M' },
  { key: '12m', label: '12M' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
]

function subMonths(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00') // noon avoids UTC day-shift
  d.setMonth(d.getMonth() - n)
  return ymd(d)
}

export default function Dashboard() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('ytd') // default range for Income/Expenses/Savings
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  // Debts get their OWN time-range filter (default MTD), independent of the tabs above
  const [debtPreset, setDebtPreset] = useState<Preset>('month')
  const [debtCustomFrom, setDebtCustomFrom] = useState('')
  const [debtCustomTo, setDebtCustomTo] = useState('')
  const [tab, setTab] = useState<Tab>('income')
  const activeTabRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [tab])

  // Remember the active tab across refreshes; also jump when the bottom bar picks one
  useEffect(() => {
    const saved = localStorage.getItem('jt-dash-tab') as Tab | null
    if (saved && TABS.some((t) => t.key === saved)) setTab(saved)
    const onJump = (e: Event) => { const k = (e as CustomEvent).detail as Tab; if (TABS.some((t) => t.key === k)) setTab(k) }
    window.addEventListener('dash-tab', onJump)
    return () => window.removeEventListener('dash-tab', onJump)
  }, [])
  const selectTab = useCallback((t: Tab) => { setTab(t); localStorage.setItem('jt-dash-tab', t) }, [])

  const load = useCallback(async () => {
    const data = await getJSON('/api/data').catch(() => [])
    if (Array.isArray(data)) setTxns(data.map((t: any) => ({ ...t, amount: Number(t.amount) })))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const maxDate = txns.length ? txns[txns.length - 1].date : today()
  const minDate = txns.length ? txns[0].date : '2024-01-01'

  // resolve a preset (+ custom bounds) into a real date range, anchored to today so
  // MTD/ranges are the true calendar month, not shifted by future-dated entries
  const resolveRange = useCallback((p: Preset, cf: string, ct: string) => {
    const t = today()
    if (p === 'custom') return { from: cf || minDate, to: ct || maxDate }
    if (p === 'all') return { from: minDate, to: maxDate }
    if (p === 'ytd') return { from: t.slice(0, 4) + '-01-01', to: t }
    // full calendar month (incl. future-dated entries this month) — matches the budget
    if (p === 'month') return { from: t.slice(0, 7) + '-01', to: ymd(new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)), 0)) }
    const n = p === '12m' ? 12 : 6
    return { from: subMonths(t, n), to: t }
  }, [minDate, maxDate])

  const { from, to } = useMemo(() => resolveRange(preset, customFrom, customTo), [resolveRange, preset, customFrom, customTo])
  const debtRange = useMemo(() => resolveRange(debtPreset, debtCustomFrom, debtCustomTo), [resolveRange, debtPreset, debtCustomFrom, debtCustomTo])

  const filtered = useMemo(
    () => txns.filter((t) => t.date >= from && t.date <= to),
    [txns, from, to],
  )
  const debtPayments = useMemo(
    () => txns.filter((t) => t.category === 'Debt Repayment' && t.date >= debtRange.from && t.date <= debtRange.to),
    [txns, debtRange],
  )

  const agg = useMemo(() => {
    let income = 0, expense = 0, savings = 0
    const byMonth = new Map<string, { month: string; income: number; expense: number; savings: number }>()
    const incomeCat = new Map<string, number>()
    const expenseCat = new Map<string, number>()
    const savingsCat = new Map<string, number>()

    for (const t of filtered) {
      const m = t.date.slice(0, 7)
      if (!byMonth.has(m)) byMonth.set(m, { month: m, income: 0, expense: 0, savings: 0 })
      const row = byMonth.get(m)!
      const cat = t.category || 'Uncategorized'
      if (t.type === 'income') { income += t.amount; row.income += t.amount; incomeCat.set(cat, (incomeCat.get(cat) || 0) + t.amount) }
      else if (t.type === 'expense') { expense += t.amount; row.expense += t.amount; expenseCat.set(cat, (expenseCat.get(cat) || 0) + t.amount) }
      else if (t.type === 'savings') { savings += t.amount; row.savings += t.amount; savingsCat.set(cat, (savingsCat.get(cat) || 0) + t.amount) }
    }
    const monthly = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({ ...r, income: Math.round(r.income), expense: Math.round(r.expense), savings: Math.round(r.savings) }))
    const toArr = (m: Map<string, number>) => [...m.entries()].map(([name, total]) => ({ name, total: Math.round(total) })).sort((a, b) => b.total - a.total)
    return {
      income, expense, savings, net: income - expense - savings,
      monthly, incomeCat: toArr(incomeCat), expenseCat: toArr(expenseCat), savingsCat: toArr(savingsCat),
    }
  }, [filtered])


  const tabType: 'income' | 'expense' | 'savings' | null =
    tab === 'income' ? 'income' : tab === 'expenses' ? 'expense' : tab === 'savings' ? 'savings' : null

  // number of calendar months spanned by the active range (for avg/month)
  const monthsSpan = useMemo(() => {
    const [fy, fm] = from.split('-').map(Number)
    const [ty, tm] = to.split('-').map(Number)
    return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1)
  }, [from, to])
  const topIncome = agg.incomeCat[0]
  const topExpense = agg.expenseCat[0]
  const topSaving = agg.savingsCat[0]
  const savingsRate = agg.income > 0 ? Math.round((agg.savings / agg.income) * 100) : 0

  const renderFilterBar = (
    p: Preset, setP: (v: Preset) => void,
    cf: string, setCf: (v: string) => void, ct: string, setCt: (v: string) => void,
    rng: { from: string; to: string }, count: number, noun = 'transactions',
  ) => (
    <section className="block">
      <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="chip-scroll">
          {PRESETS.map((preset) => (
            <button key={preset.key}
              onClick={() => { setP(preset.key); if (preset.key === 'custom') { if (!cf) setCf(rng.from); if (!ct) setCt(rng.to) } }}
              className={`chip ${p === preset.key ? 'chip-active' : ''}`}>{preset.label}</button>
          ))}
        </div>
        {p === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            <input type="date" style={{ flex: 1, minWidth: 0 }} value={cf || minDate} min={minDate} max={maxDate}
              onChange={(e) => setCf(e.target.value)} className="date-input" />
            <span className="stat-label">to</span>
            <input type="date" style={{ flex: 1, minWidth: 0 }} value={ct || maxDate} min={minDate} max={maxDate}
              onChange={(e) => setCt(e.target.value)} className="date-input" />
          </div>
        )}
      </div>
      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 8, textAlign: 'center' }}>
        {rng.from} → {rng.to} · {count} {noun}
      </div>
    </section>
  )
  const filterBar = renderFilterBar(preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, { from, to }, filtered.length)
  const debtFilterBar = renderFilterBar(debtPreset, setDebtPreset, debtCustomFrom, setDebtCustomFrom, debtCustomTo, setDebtCustomTo, debtRange, debtPayments.length, 'payments')

  if (loading) {
    return (
      <div className="bg-aurora">
        <div className="wrap">
          <DashHeader />
          <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Loading your analytics…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-aurora">
      <div className="wrap">
        <DashHeader />

        {/* Section pills — primary nav, on top (scrolls; active tab kept in view) */}
        <section className="block" style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="tabs tabs-scroll">
            {TABS.map((t) => {
              const Icon = t.Icon
              return (
                <button key={t.key} ref={tab === t.key ? activeTabRef : null} onClick={() => selectTab(t.key)}
                  className={`tab ${tab === t.key ? 'tab-active' : ''}`}>
                  <Icon size={16} />{t.label}
                  {t.soon && <span style={{ fontSize: 9, opacity: 0.65, marginLeft: 2 }}>soon</span>}
                </button>
              )
            })}
          </div>
        </section>

        {/* Time-range filter — top of data tabs (on Debts it sits above Recent instead) */}
        {(tab === 'income' || tab === 'expenses' || tab === 'savings') && filterBar}

        {/* INCOME */}
        {tab === 'income' && (
          <>
            <HeroRow stats={[
              { label: 'Total Income', value: money(agg.income), cls: 'income' },
              { label: 'Top Source', value: topIncome ? money(topIncome.total) : '—', sub: topIncome?.name },
              { label: 'Avg / Month', value: money(agg.income / monthsSpan), sub: `over ${monthsSpan} month${monthsSpan > 1 ? 's' : ''}` },
            ]} />
            <section className="block">
              <div className="grid-2">
                <div className="card glass">
                  <ChartHead title="Income over time" />
                  <MonthlyArea data={agg.monthly} series={[{ key: 'income', name: 'Income', color: COLORS.income }]} />
                </div>
                <div className="card glass">
                  <ChartHead title="Income by source" />
                  <HBar data={agg.incomeCat} color={COLORS.income} />
                </div>
              </div>
            </section>
          </>
        )}

        {/* EXPENSES */}
        {tab === 'expenses' && (
          <>
            <HeroRow stats={[
              { label: 'Total Expenses', value: money(agg.expense), cls: 'expense' },
              { label: 'Top Category', value: topExpense ? money(topExpense.total) : '—', sub: topExpense?.name },
              { label: 'Avg / Month', value: money(agg.expense / monthsSpan), sub: `over ${monthsSpan} month${monthsSpan > 1 ? 's' : ''}` },
            ]} />
            <section className="block">
              <div className="grid-2">
                <div className="card glass">
                  <ChartHead title="Expenses over time" />
                  <MonthlyArea data={agg.monthly} series={[{ key: 'expense', name: 'Expenses', color: COLORS.expense }]} />
                </div>
                <div className="card glass">
                  <ChartHead title="Top categories" />
                  <HBar data={agg.expenseCat.slice(0, 10)} color={COLORS.expense} />
                </div>
              </div>
            </section>
          </>
        )}

        {/* SAVINGS */}
        {tab === 'savings' && (
          <>
            <HeroRow stats={[
              { label: 'Total Savings', value: money(agg.savings), cls: 'savings' },
              { label: 'Top Account', value: topSaving ? money(topSaving.total) : '—', sub: topSaving?.name },
              { label: 'Savings Rate', value: `${savingsRate}%`, sub: 'of income' },
            ]} />
            <section className="block">
              <div className="grid-2">
                <div className="card glass">
                  <ChartHead title="Savings over time" />
                  <MonthlyArea data={agg.monthly} series={[{ key: 'savings', name: 'Savings', color: COLORS.savings }]} />
                </div>
                <div className="card glass">
                  <ChartHead title="Savings by account" />
                  <HBar data={agg.savingsCat} color={COLORS.savings} />
                </div>
              </div>
            </section>
          </>
        )}

        {/* DEBTS */}
        {/* DEBTS — debt management, then a time-range filter that only scopes the payments list */}
        {tab === 'debts' && (
          <>
            <section className="block">
              <DebtManager />
            </section>
            {debtFilterBar}
            <RecentList
              title="Recent Debt Payments"
              txns={debtPayments.slice().reverse()}
              emptyLabel="No debt payments in this period."
              maxHeight={360}
            />
          </>
        )}

        {/* INVESTMENTS */}
        {tab === 'investments' && (
          <section className="block" style={{ marginBottom: 64 }}>
            <InvestmentsPanel />
          </section>
        )}
        {tab === 'household' && (
          <section className="block" style={{ marginBottom: 64 }}>
            <ProfilePanel />
          </section>
        )}
        {tab === 'budget' && (
          <section className="block" style={{ marginBottom: 64 }}>
            <BudgetManager />
          </section>
        )}
        {tab === 'bills' && (
          <section className="block">
            <BillRunway />
          </section>
        )}

        {/* Recent — the income/expenses/savings tabs (Debts has its own list above) */}
        {(tab === 'income' || tab === 'expenses' || tab === 'savings') && (
          <RecentList
            title={`Recent ${TABS.find((t) => t.key === tab)!.label}`}
            txns={filtered
              .filter((t) => tabType && t.type === tabType)
              .slice().reverse().slice(0, 12)}
            emptyLabel={`No ${TABS.find((t) => t.key === tab)!.label.toLowerCase()} in this period.`}
          />
        )}
      </div>
    </div>
  )
}

function DashHeader() {
  return (
    <header className="top">
      <Link href="/" className="brand" aria-label="Home"><Logo /></Link>
      <PagePill current="dashboard" />
      <HeaderNav current="dashboard" />
    </header>
  )
}

interface Stat { label: string; value: string; sub?: string; cls?: string }


// One hero stat (the number that matters) with the rest as a quiet supporting line.
function HeroRow({ stats }: { stats: Stat[] }) {
  const [primary, ...rest] = stats
  return (
    <section className="block">
      <div className="card glass hero-row">
        <div style={{ flex: '1 1 auto', minWidth: 0, textAlign: 'left' }}>
          <span className="hdr-label">{primary.label}</span>
          <div className={`stat-value ${primary.cls || ''}`} style={{ fontSize: 'clamp(24px, 6.5vw, 42px)', letterSpacing: '-0.03em', marginTop: 4, whiteSpace: 'nowrap' }}>{primary.value}</div>
        </div>
        {rest.length > 0 && (
          <div className="hero-aside" style={{ display: 'grid', gap: 4, whiteSpace: 'nowrap' }}>
            {rest.map((s) => (
              <div key={s.label} style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {s.label} <b style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{s.value}</b>{s.sub ? ` · ${s.sub}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// Minimalist chart header — just the label, matching the rest of the site.
function ChartHead({ title }: { title: string; sub?: string }) {
  return <div style={{ marginBottom: 12 }}><span className="hdr-label">{title}</span></div>
}

// ---- Recent transactions list (edit + delete inline) ----
const iconBtn: React.CSSProperties = {
  display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
}

function RecentList({ title, txns, emptyLabel, maxHeight }: { title: string; txns: Txn[]; emptyLabel: string; maxHeight?: number }) {
  const [editTx, setEditTx] = useState<Txn | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const refresh = () => window.dispatchEvent(new CustomEvent('transaction-added'))
  const del = async (id: string) => {
    if (!confirm('Delete this transaction?')) return
    const res = await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })
    if (res.ok) refresh()
    else alert('Could not delete.')
  }

  return (
    <section className="block" style={{ marginBottom: 64 }}>
      <div className="card glass">
        <div className="hdr-label" style={{ marginBottom: 14 }}>{title}</div>
        {txns.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>{emptyLabel}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, ...(maxHeight ? { maxHeight, overflowY: 'auto', overscrollBehavior: 'contain' } : {}) }}>
            {txns.map((t) => (
              <div key={t.id} className={`list-row ${openId === t.id ? 'open' : ''}`}
                onClick={() => setOpenId((id) => (id === t.id ? null : t.id))}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description || t.category}</div>
                  <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>{t.date} · {t.category}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span className={`stat-value ${t.type}`} style={{ fontSize: 16, fontWeight: 700 }}>
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money2(t.amount)}
                  </span>
                  <div className="row-actions">
                    <button onClick={(e) => { e.stopPropagation(); setEditTx(t) }} aria-label="Edit" title="Edit" style={iconBtn}><Pencil size={16} /></button>
                    <button onClick={(e) => { e.stopPropagation(); del(t.id) }} aria-label="Delete" title="Delete" style={iconBtn}><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editTx && (
        <EditTransactionModal tx={editTx} onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); refresh() }} />
      )}
    </section>
  )
}

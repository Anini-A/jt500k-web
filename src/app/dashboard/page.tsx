'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Wallet, CreditCard, PiggyBank, LineChart, type LucideIcon } from 'lucide-react'
import GoalTracker from '@/components/GoalTracker'
import ChatWidget from '@/components/ChatWidget'
import HeaderNav from '@/components/HeaderNav'
import { MonthlyArea, HBar, Donut, COLORS } from '@/components/DashCharts'

type Tab = 'income' | 'expenses' | 'savings' | 'investments'
const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'income', label: 'Income', Icon: Wallet },
  { key: 'expenses', label: 'Expenses', Icon: CreditCard },
  { key: 'savings', label: 'Savings', Icon: PiggyBank },
  { key: 'investments', label: 'Investments', Icon: LineChart },
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

type Preset = 'all' | 'ytd' | '12m' | '6m' | '3m' | 'custom'
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ytd', label: 'YTD' },
  { key: '12m', label: '12M' },
  { key: '6m', label: '6M' },
  { key: '3m', label: '3M' },
]

function subMonths(iso: string, n: number) {
  const d = new Date(iso)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

export default function Dashboard() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('12m')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [tab, setTab] = useState<Tab>('income')

  const load = useCallback(async () => {
    const data = await fetch('/api/data').then((r) => r.json()).catch(() => [])
    if (Array.isArray(data)) setTxns(data.map((t: any) => ({ ...t, amount: Number(t.amount) })))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  const maxDate = txns.length ? txns[txns.length - 1].date : new Date().toISOString().slice(0, 10)
  const minDate = txns.length ? txns[0].date : '2024-01-01'

  // resolve active date range
  const { from, to } = useMemo(() => {
    if (preset === 'custom') return { from: customFrom || minDate, to: customTo || maxDate }
    if (preset === 'all') return { from: minDate, to: maxDate }
    if (preset === 'ytd') return { from: maxDate.slice(0, 4) + '-01-01', to: maxDate }
    const n = preset === '12m' ? 12 : preset === '6m' ? 6 : 3
    return { from: subMonths(maxDate, n), to: maxDate }
  }, [preset, customFrom, customTo, minDate, maxDate])

  const filtered = useMemo(
    () => txns.filter((t) => t.date >= from && t.date <= to),
    [txns, from, to],
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

  const allTimeSavings = useMemo(() => txns.filter((t) => t.type === 'savings').reduce((s, t) => s + t.amount, 0), [txns])

  const tabType: 'income' | 'expense' | 'savings' | null =
    tab === 'income' ? 'income' : tab === 'expenses' ? 'expense' : tab === 'savings' ? 'savings' : null

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
        {/* Filter bar */}
        <section className="block">
          <div className="card glass" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button key={p.key} onClick={() => setPreset(p.key)}
                  className={`chip ${preset === p.key ? 'chip-active' : ''}`}>{p.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={preset === 'custom' ? (customFrom || minDate) : from} min={minDate} max={maxDate}
                onChange={(e) => { setPreset('custom'); setCustomFrom(e.target.value) }} className="date-input" />
              <span className="stat-label">to</span>
              <input type="date" value={preset === 'custom' ? (customTo || maxDate) : to} min={minDate} max={maxDate}
                onChange={(e) => { setPreset('custom'); setCustomTo(e.target.value) }} className="date-input" />
            </div>
          </div>
        </section>

        {/* KPIs for the period */}
        <section className="block">
          <div className="card glass">
            <div className="stat-grid">
              <Kpi emoji="💰" label="Income" value={money(agg.income)} cls="income" />
              <Kpi emoji="💸" label="Expenses" value={money(agg.expense)} cls="expense" />
              <Kpi emoji="🏦" label="Savings" value={money(agg.savings)} cls="savings" />
            </div>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 12, textAlign: 'center' }}>
              {from} → {to} · {filtered.length} transactions
            </div>
          </div>
        </section>

        {/* Section tabs */}
        <section className="block" style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="tabs">
            {TABS.map((t) => {
              const Icon = t.Icon
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`tab ${tab === t.key ? 'tab-active' : ''}`}>
                  <Icon size={16} />{t.label}
                </button>
              )
            })}
          </div>
        </section>

        {/* INCOME */}
        {tab === 'income' && (
          <section className="block">
            <div className="grid-2">
              <div className="card glass">
                <ChartHead title="Income Over Time" sub="Monthly income for the selected period" />
                <MonthlyArea data={agg.monthly} series={[{ key: 'income', name: 'Income', color: COLORS.income }]} />
              </div>
              <div className="card glass">
                <ChartHead title="Income by Source" sub="Where your money comes from" />
                <HBar data={agg.incomeCat} color={COLORS.income} />
              </div>
            </div>
          </section>
        )}

        {/* EXPENSES */}
        {tab === 'expenses' && (
          <section className="block">
            <div className="grid-2">
              <div className="card glass">
                <ChartHead title="Expenses Over Time" sub="Monthly spending for the selected period" />
                <MonthlyArea data={agg.monthly} series={[{ key: 'expense', name: 'Expenses', color: COLORS.expense }]} />
              </div>
              <div className="card glass">
                <ChartHead title="Spending Breakdown" sub="Share by category" />
                <Donut data={agg.expenseCat.slice(0, 8)} />
              </div>
            </div>
            <div className="card glass" style={{ marginTop: 16 }}>
              <ChartHead title="Top Expense Categories" sub="Ranked by total spent" />
              <HBar data={agg.expenseCat.slice(0, 10)} color={COLORS.expense} />
            </div>
          </section>
        )}

        {/* SAVINGS */}
        {tab === 'savings' && (
          <section className="block">
            <GoalTracker saved={allTimeSavings} />
            <div className="grid-2">
              <div className="card glass">
                <ChartHead title="Savings Over Time" sub="Monthly amount set aside" />
                <MonthlyArea data={agg.monthly} series={[{ key: 'savings', name: 'Savings', color: COLORS.savings }]} />
              </div>
              <div className="card glass">
                <ChartHead title="Savings by Account" sub="Where you're building wealth" />
                <HBar data={agg.savingsCat} color={COLORS.savings} />
              </div>
            </div>
          </section>
        )}

        {/* INVESTMENTS */}
        {tab === 'investments' && (
          <section className="block">
            <div className="card glass" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🚧</div>
              <h3 style={{ margin: '0 0 6px' }}>Coming soon</h3>
              <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: 0 }}>
                Portfolio tracking (MSTY, dividends, book value vs market value) will live here.
              </p>
            </div>
          </section>
        )}

        {/* Recent — filtered to the active tab's type */}
        <SectionTitle emoji="🧾" title={`Recent ${TABS.find((t) => t.key === tab)!.label}`} />
        <RecentList
          txns={filtered.filter((t) => tabType && t.type === tabType).slice().reverse().slice(0, 12)}
          emptyLabel={tab === 'investments' ? 'No investment transactions yet.' : `No ${TABS.find((t) => t.key === tab)!.label.toLowerCase()} in this period.`}
        />
      </div>

      <ChatWidget />
    </div>
  )
}

function DashHeader() {
  return (
    <header className="top">
      <div className="brand"><span>Dashboard</span></div>
      <HeaderNav current="dashboard" />
    </header>
  )
}

function Kpi({ emoji, label, value, cls }: { emoji: string; label: string; value: string; cls: string }) {
  return (
    <div className="stat-card">
      <div style={{ fontSize: 24, marginBottom: 8 }}>{emoji}</div>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls}`}>{value}</div>
    </div>
  )
}

function SectionTitle({ emoji, title }: { emoji: string; title: string }) {
  return (
    <h2 style={{ margin: '28px 0 4px', fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>{emoji}</span>{title}
    </h2>
  )
}

function ChartHead({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h3 style={{ margin: '0 0 2px', fontSize: 15 }}>{title}</h3>
      <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 14 }}>{sub}</p>
    </>
  )
}

// ---- Recent transactions list (add is handled by the header button) ----
function RecentList({ txns, emptyLabel }: { txns: Txn[]; emptyLabel: string }) {
  return (
    <section className="block" style={{ marginBottom: 64 }}>
      <div className="card glass">
        {txns.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>{emptyLabel}</div>
        ) : (
          <div style={{ display: 'grid', gap: 2 }}>
            {txns.map((t) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.description || t.category}</div>
                  <div className="stat-label">{t.date} · {t.category}</div>
                </div>
                <div className={`stat-value ${t.type}`} style={{ fontSize: 16 }}>
                  {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money2(t.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

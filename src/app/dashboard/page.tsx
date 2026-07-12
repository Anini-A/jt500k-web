'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Wallet, CreditCard, PiggyBank, LineChart, Banknote, Shield, Target, Pencil, Trash2, type LucideIcon } from 'lucide-react'
import ChatWidget from '@/components/ChatWidget'
import HeaderNav from '@/components/HeaderNav'
import DebtManager from '@/components/DebtManager'
import BudgetManager from '@/components/BudgetManager'
import InvestmentsPanel from '@/components/InvestmentsPanel'
import EditTransactionModal from '@/components/EditTransactionModal'
import { getJSON } from '@/lib/fresh'
import { MonthlyArea, HBar, Donut, COLORS } from '@/components/DashCharts'

type Tab = 'income' | 'expenses' | 'savings' | 'debts' | 'investments' | 'insurance' | 'budget'
const TABS: { key: Tab; label: string; Icon: LucideIcon; soon?: boolean }[] = [
  { key: 'budget', label: 'Budget', Icon: Target },
  { key: 'income', label: 'Income', Icon: Wallet },
  { key: 'expenses', label: 'Expenses', Icon: CreditCard },
  { key: 'savings', label: 'Savings', Icon: PiggyBank },
  { key: 'debts', label: 'Debts', Icon: Banknote },
  { key: 'investments', label: 'Investments', Icon: LineChart },
  { key: 'insurance', label: 'Insurance', Icon: Shield, soon: true },
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

type Preset = 'all' | 'ytd' | '12m' | '6m' | '3m' | 'mtd' | 'custom'
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ytd', label: 'YTD' },
  { key: '12m', label: '12M' },
  { key: '6m', label: '6M' },
  { key: '3m', label: '3M' },
  { key: 'mtd', label: 'MTD' },
]

function subMonths(iso: string, n: number) {
  const d = new Date(iso)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

export default function Dashboard() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('ytd')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [tab, setTab] = useState<Tab>('income')

  // Remember the active tab across refreshes
  useEffect(() => {
    const saved = localStorage.getItem('jt-dash-tab') as Tab | null
    if (saved && TABS.some((t) => t.key === saved)) setTab(saved)
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

  const maxDate = txns.length ? txns[txns.length - 1].date : new Date().toISOString().slice(0, 10)
  const minDate = txns.length ? txns[0].date : '2024-01-01'

  // resolve active date range
  const { from, to } = useMemo(() => {
    if (preset === 'custom') return { from: customFrom || minDate, to: customTo || maxDate }
    if (preset === 'all') return { from: minDate, to: maxDate }
    if (preset === 'ytd') return { from: maxDate.slice(0, 4) + '-01-01', to: maxDate }
    if (preset === 'mtd') return { from: maxDate.slice(0, 7) + '-01', to: maxDate }
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

  const filterBar = (
    <section className="block">
      <div className="card glass" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
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
      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 8, textAlign: 'center' }}>
        {from} → {to} · {filtered.length} transactions
      </div>
    </section>
  )

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

        {/* Section pills — primary nav, on top */}
        <section className="block" style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="tabs">
            {TABS.map((t) => {
              const Icon = t.Icon
              return (
                <button key={t.key} onClick={() => selectTab(t.key)}
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
              { emoji: '💰', label: 'Total Income', value: money(agg.income), cls: 'income' },
              { emoji: '🏆', label: 'Top Source', value: topIncome ? money(topIncome.total) : '—', sub: topIncome?.name },
              { emoji: '📆', label: 'Avg / Month', value: money(agg.income / monthsSpan), sub: `over ${monthsSpan} month${monthsSpan > 1 ? 's' : ''}` },
            ]} />
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
          </>
        )}

        {/* EXPENSES */}
        {tab === 'expenses' && (
          <>
            <HeroRow stats={[
              { emoji: '💸', label: 'Total Expenses', value: money(agg.expense), cls: 'expense' },
              { emoji: '🏆', label: 'Top Category', value: topExpense ? money(topExpense.total) : '—', sub: topExpense?.name },
              { emoji: '📆', label: 'Avg / Month', value: money(agg.expense / monthsSpan), sub: `over ${monthsSpan} month${monthsSpan > 1 ? 's' : ''}` },
            ]} />
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
          </>
        )}

        {/* SAVINGS */}
        {tab === 'savings' && (
          <>
            <HeroRow stats={[
              { emoji: '🏦', label: 'Total Savings', value: money(agg.savings), cls: 'savings' },
              { emoji: '🏆', label: 'Top Account', value: topSaving ? money(topSaving.total) : '—', sub: topSaving?.name },
              { emoji: '📈', label: 'Savings Rate', value: `${savingsRate}%`, sub: 'of income' },
            ]} />
            <section className="block">
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
          </>
        )}

        {/* DEBTS */}
        {tab === 'debts' && (
          <section className="block">
            <DebtManager />
          </section>
        )}

        {/* INVESTMENTS */}
        {tab === 'investments' && (
          <section className="block" style={{ marginBottom: 64 }}>
            <InvestmentsPanel />
          </section>
        )}
        {tab === 'insurance' && (
          <ComingSoon emoji="🛡️" title="Insurance — coming soon"
            sub="Track policies and premiums (life, home, auto, health) here." />
        )}
        {tab === 'budget' && (
          <section className="block" style={{ marginBottom: 64 }}>
            <BudgetManager />
          </section>
        )}

        {/* On Debts, the filter sits here (it only reshapes the payments below, not balances) */}
        {tab === 'debts' && filterBar}

        {/* Recent — only on the transaction-backed tabs */}
        {(tab === 'income' || tab === 'expenses' || tab === 'savings' || tab === 'debts') && (
          <RecentList
            title={tab === 'debts' ? '🧾 Recent Debt Payments' : `🧾 Recent ${TABS.find((t) => t.key === tab)!.label}`}
            txns={filtered
              .filter((t) => tab === 'debts' ? t.category === 'Debt Repayment' : (tabType && t.type === tabType))
              .slice().reverse().slice(0, 12)}
            emptyLabel={tab === 'debts' ? 'No debt payments in this period.' : `No ${TABS.find((t) => t.key === tab)!.label.toLowerCase()} in this period.`}
          />
        )}
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

interface Stat { emoji: string; label: string; value: string; sub?: string; cls?: string }

function HeroStat({ emoji, label, value, sub, cls }: Stat) {
  return (
    <div className="stat-card">
      <div style={{ fontSize: 24, marginBottom: 8 }}>{emoji}</div>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls || ''}`}>{value}</div>
      {sub && <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{sub}</div>}
    </div>
  )
}

function HeroRow({ stats }: { stats: Stat[] }) {
  return (
    <section className="block">
      <div className="card glass">
        <div className="stat-grid">
          {stats.map((s) => <HeroStat key={s.label} {...s} />)}
        </div>
      </div>
    </section>
  )
}

function ComingSoon({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <section className="block" style={{ marginBottom: 64 }}>
      <div className="card glass" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{emoji}</div>
        <h3 style={{ margin: '0 0 6px' }}>{title}</h3>
        <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: 0 }}>{sub}</p>
      </div>
    </section>
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

// ---- Recent transactions list (edit + delete inline) ----
const iconBtn: React.CSSProperties = {
  display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
}

function RecentList({ title, txns, emptyLabel }: { title: string; txns: Txn[]; emptyLabel: string }) {
  const [editTx, setEditTx] = useState<Txn | null>(null)

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
        <h2 style={{ marginTop: 0, marginBottom: 14, fontSize: 18 }}>{title}</h2>
        {txns.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>{emptyLabel}</div>
        ) : (
          <div style={{ display: 'grid', gap: 2 }}>
            {txns.map((t) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description || t.category}</div>
                  <div className="stat-label">{t.date} · {t.category}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span className={`stat-value ${t.type}`} style={{ fontSize: 16 }}>
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money2(t.amount)}
                  </span>
                  <button onClick={() => setEditTx(t)} aria-label="Edit" title="Edit" style={iconBtn}><Pencil size={16} /></button>
                  <button onClick={() => del(t.id)} aria-label="Delete" title="Delete" style={iconBtn}><Trash2 size={16} /></button>
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

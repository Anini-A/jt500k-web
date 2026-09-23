'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Wallet, CreditCard, PiggyBank, LineChart, Banknote, Target, Users, Receipt, Pencil, Trash2, ChevronDown, Home as HomeIcon, Shield, ScrollText, Flag, Plus, type LucideIcon } from 'lucide-react'
import HeaderNav from '@/components/HeaderNav'
import PagePill from '@/components/PagePill'
import NotificationBell from '@/components/NotificationCenter'
import DebtManager from '@/components/DebtManager'
import BillRunway from '@/components/BillRunway'
import BudgetManager from '@/components/BudgetManager'
import InvestmentsPanel from '@/components/InvestmentsPanel'
import ProfilePanel from '@/components/ProfilePanel'
import EditTransactionModal from '@/components/EditTransactionModal'
import { useConfirm, useToast } from '@/components/Feedback'
import { getJSON, cachedValue } from '@/lib/fresh'
import { ymd, today } from '@/lib/date'
import { MonthlyArea, HBar, COLORS } from '@/components/DashCharts'

type Tab = 'income' | 'expenses' | 'savings' | 'debts' | 'investments' | 'budget' | 'bills' | 'household'
const TABS: { key: Tab; label: string; Icon: LucideIcon; soon?: boolean }[] = [
  { key: 'budget', label: 'Budget', Icon: Target },
  { key: 'bills', label: 'Bills', Icon: Receipt },
  { key: 'debts', label: 'Debts', Icon: Banknote },
  { key: 'income', label: 'Income', Icon: Wallet },
  { key: 'expenses', label: 'Expenses', Icon: CreditCard },
  { key: 'savings', label: 'Savings', Icon: PiggyBank },
  { key: 'investments', label: 'Investments', Icon: LineChart },
  { key: 'household', label: 'Household', Icon: Users },
]

// Mirrors ProfilePanel's SECTION_META ids/labels exactly — the dropdown below the
// Household tab jumps straight to one of these instead of landing on the panel's
// own default section every time.
const HOUSEHOLD_ITEMS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: 'members', label: 'Members', Icon: Users },
  { id: 'home', label: 'Mortgage', Icon: HomeIcon },
  { id: 'insurance', label: 'Insurance', Icon: Shield },
  { id: 'estate', label: 'Estate', Icon: ScrollText },
  { id: 'goals', label: 'Goals', Icon: Flag },
]

interface Txn {
  id: string
  date: string
  type: 'income' | 'expense' | 'savings'
  category: string | null
  description: string | null
  amount: number
}

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
const money2 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })

type Preset = 'all' | 'ytd' | '12m' | '6m' | 'month' | 'custom'
// Canonical range set, shared across the app.
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'ytd', label: 'YTD' },
  { key: '6m', label: '6M' },
  { key: '12m', label: '12M' },
  { key: 'all', label: 'ALL' },
  { key: 'custom', label: 'Custom' },
]

function subMonths(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00') // noon avoids UTC day-shift
  d.setMonth(d.getMonth() - n)
  return ymd(d)
}

export default function Dashboard() {
  // Paint from the last good response, then revalidate — a revisited page shows its
  // numbers immediately instead of a blank frame that fills in and jumps.
  const cachedTxns = cachedValue<Txn[]>('/api/data')
  const [txns, setTxns] = useState<Txn[]>(() => cachedTxns ?? [])
  const [loading, setLoading] = useState(!cachedTxns)
  const [preset, setPreset] = useState<Preset>('ytd') // default range for Income/Expenses/Savings
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
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

  // Household/Bills open a dropdown of their sub-sections instead of jumping straight
  // in — picking one both switches the tab AND hands the target section/account to
  // the panel via the same localStorage handoff BillRunway already used for the Home
  // page's shortfall link (consumed once, on that panel's next load).
  const [dropdown, setDropdown] = useState<{ key: 'household' | 'bills'; rect: DOMRect } | null>(null)
  const [billAccounts, setBillAccounts] = useState<{ id: string; name: string }[]>(
    () => cachedValue<{ accounts: { id: string; name: string }[] }>('/api/bills')?.accounts ?? []
  )
  useEffect(() => {
    getJSON('/api/bills').then((d) => { if (d && !d.error) setBillAccounts((d.accounts || []).map((a: any) => ({ id: a.id, name: a.name }))) }).catch(() => {})
  }, [])
  // localStorage handoff alone only takes effect on the NEXT mount of the target
  // panel — fine when switching tabs into it, but a no-op if you're already on that
  // tab (selectTab('bills') from 'bills' doesn't remount BillRunway, so the write
  // just sits there unread until something else remounts it, e.g. a refresh). The
  // matching CustomEvent covers that case: the panel, if already mounted, updates
  // immediately; if not yet mounted, no listener is attached and the localStorage
  // handoff (read on mount) is what actually applies it.
  const pickHousehold = (id: string) => {
    try { localStorage.setItem('jt-household-section', id) } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('household-section', { detail: id }))
    selectTab('household'); setDropdown(null)
  }
  const pickBillAccount = (id: string) => {
    try { localStorage.setItem('jt-bill-account', id) } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('bill-account', { detail: id }))
    selectTab('bills'); setDropdown(null)
  }
  const pickAddBillAccount = () => {
    try { localStorage.setItem('jt-bill-account', '__add__') } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('bill-add-account'))
    selectTab('bills'); setDropdown(null)
  }

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
  const savingsRate = agg.income > 0 ? Math.round((agg.savings / agg.income) * 100) : 0

  const renderFilterBar = (
    p: Preset, setP: (v: Preset) => void,
    cf: string, setCf: (v: string) => void, ct: string, setCt: (v: string) => void,
    rng: { from: string; to: string }, count: number, noun = 'transactions',
  ) => (
    <section className="block">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

  const openSub = (key: 'household' | 'bills', rect: DOMRect) => setDropdown({ key, rect })

  if (loading) {
    return (
      <div className="bg-aurora">
        <div className="wrap">
          <DashHeader tab={tab} onSelectTab={selectTab} onOpenSub={openSub} />
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>Loading your analytics…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-aurora">
      <div className="wrap">
        <DashHeader tab={tab} onSelectTab={selectTab} onOpenSub={openSub} />

        {/* Section pills — desktop only now (dash-tabs-row). On mobile, the header's
            SectionCarousel (between the bell and gear, where PagePill already centres
            itself but hides below 640px) replaces this: swipe or tap a peeking
            neighbour to change section, tap the centred/active one to drill into
            Household/Bills' own sub-list. */}
        <section className="block dash-tabs-row">
          <div className="tabs tabs-scroll">
            {TABS.map((t) => {
              const Icon = t.Icon
              const hasDropdown = t.key === 'household' || t.key === 'bills'
              return (
                <button key={t.key} ref={tab === t.key ? activeTabRef : null}
                  onClick={(e) => hasDropdown
                    ? setDropdown({ key: t.key as 'household' | 'bills', rect: e.currentTarget.getBoundingClientRect() })
                    : selectTab(t.key)}
                  className={`tab ${tab === t.key ? 'tab-active' : ''}`}>
                  <Icon size={16} />{t.label}
                  {hasDropdown && <ChevronDown size={13} style={{ opacity: 0.6, marginLeft: -2 }} />}
                  {/* 9px: a superscript adornment, not body text — 11px crowds the tab it hangs off */}
                  {t.soon && <span style={{ fontSize: 9, opacity: 0.65, marginLeft: 2 }}>soon</span>}
                </button>
              )
            })}
          </div>
        </section>

        {dropdown && createPortal(
          <TabDropdown
            dropdown={dropdown}
            onClose={() => setDropdown(null)}
            billAccounts={billAccounts}
            onPickHousehold={pickHousehold}
            onPickBillAccount={pickBillAccount}
            onPickAddBillAccount={pickAddBillAccount}
          />,
          document.body
        )}

        {/* Time-range filter — top of data tabs (on Debts it sits above Recent instead) */}
        {(tab === 'income' || tab === 'expenses' || tab === 'savings') && filterBar}

        {/* INCOME */}
        {tab === 'income' && (
          <>
            <HeroRow stats={[
              { label: 'Total Income', value: money(agg.income), cls: 'income' },
              { label: 'Avg per month', value: money(agg.income / monthsSpan), sub: `over ${monthsSpan} month${monthsSpan > 1 ? 's' : ''}` },
            ]} />
            <section className="block">
              <div className="grid-2">
                <div className="card">
                  <ChartHead title="Income over time" />
                  <MonthlyArea data={agg.monthly} series={[{ key: 'income', name: 'Income', color: COLORS.income }]} />
                </div>
                <div className="card">
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
              { label: 'Avg per month', value: money(agg.expense / monthsSpan), sub: `over ${monthsSpan} month${monthsSpan > 1 ? 's' : ''}` },
            ]} />
            <section className="block">
              <div className="grid-2">
                <div className="card">
                  <ChartHead title="Expenses over time" />
                  <MonthlyArea data={agg.monthly} series={[{ key: 'expense', name: 'Expenses', color: COLORS.expense }]} />
                </div>
                <div className="card">
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
              { label: 'Savings Rate', value: `${savingsRate}%`, sub: 'of income' },
            ]} />
            <section className="block">
              <div className="grid-2">
                <div className="card">
                  <ChartHead title="Savings over time" />
                  <MonthlyArea data={agg.monthly} series={[{ key: 'savings', name: 'Savings', color: COLORS.savings }]} />
                </div>
                <div className="card">
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
          <section className="block" style={{ marginBottom: 64 }}>
            <DebtManager />
          </section>
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

// Glass menu anchored below whatever opened it (portalled to <body> so .tabs' own
// overflow-x:auto, or the header's own bounds, never clips it). 'section' — the
// compact mobile header pill's menu — lists all 8 tabs, 2-up; picking Household or
// Bills there swaps this same panel to their own sub-list (onOpenSub) rather than
// closing, so it reads as drilling in one level, not two separate menus. Household
// lists its fixed sections; Bills lists the real accounts (fetched by the parent)
// plus "Add account".
function TabDropdown({ dropdown, onClose, billAccounts, onPickHousehold, onPickBillAccount, onPickAddBillAccount }: {
  dropdown: { key: 'household' | 'bills'; rect: DOMRect }
  onClose: () => void
  billAccounts: { id: string; name: string }[]
  onPickHousehold: (id: string) => void
  onPickBillAccount: (id: string) => void
  onPickAddBillAccount: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const { rect, key } = dropdown
  const width = 210
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
  const top = rect.bottom + 8

  return (
    <div className="dash-menu dash-menu--drop dash-menu--single" ref={ref}
      style={{ top, left, width, right: 'auto', bottom: 'auto' }}>
      {key === 'household' && HOUSEHOLD_ITEMS.map((it) => {
        const Icon = it.Icon
        return <button key={it.id} onClick={() => onPickHousehold(it.id)}><Icon size={17} /> {it.label}</button>
      })}
      {key === 'bills' && billAccounts.map((a) => (
        <button key={a.id} onClick={() => onPickBillAccount(a.id)}>{a.name}</button>
      ))}
      {key === 'bills' && (
        <button onClick={onPickAddBillAccount}><Plus size={17} /> Add account</button>
      )}
    </div>
  )
}

// Swipeable, centred section switcher — mobile only, replacing the header's dead
// space where PagePill hides itself (below 640px it defers to the bottom nav).
// Native scroll-snap does the drag/swipe physics; a mask-image on the wrapper fades
// the peeking neighbours at the edges, matching the "hint of what's next" look.
// Tapping a peeking neighbour scrolls it to centre; tapping the ALREADY-centred item
// opens its sub-list when that item is Household or Bills.
function SectionCarousel({ tab, onSelectTab, onOpenSub }: {
  tab: Tab
  onSelectTab: (key: Tab) => void
  onOpenSub: (key: 'household' | 'bills', rect: DOMRect) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [centerIdx, setCenterIdx] = useState(() => Math.max(0, TABS.findIndex((t) => t.key === tab)))
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set right before WE call onSelectTab from a settled scroll, so the sync effect
  // below (which fires on every tab change, external or our own) skips the smooth-
  // scroll animation for a position the drag has already put us at.
  const ownChange = useRef(false)

  useEffect(() => {
    const idx = TABS.findIndex((t) => t.key === tab)
    if (idx < 0) return
    setCenterIdx(idx)
    itemRefs.current[idx]?.scrollIntoView({ behavior: ownChange.current ? 'auto' : 'smooth', inline: 'center', block: 'nearest' })
    ownChange.current = false
  }, [tab])

  const handleScroll = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    // Debounced rather than scrollend: broader support (older Safari/iOS PWA included)
    // and settle-detection is all this needs — nothing reads scroll position mid-drag.
    settleTimer.current = setTimeout(() => {
      const el = trackRef.current
      if (!el) return
      const mid = el.scrollLeft + el.clientWidth / 2
      let best = 0, bestDist = Infinity
      itemRefs.current.forEach((btn, i) => {
        if (!btn) return
        const center = btn.offsetLeft + btn.offsetWidth / 2
        const d = Math.abs(center - mid)
        if (d < bestDist) { bestDist = d; best = i }
      })
      setCenterIdx(best)
      if (TABS[best].key !== tab) { ownChange.current = true; onSelectTab(TABS[best].key) }
    }, 120)
  }

  const handleTap = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (i === centerIdx) {
      const key = TABS[i].key
      if (key === 'household' || key === 'bills') onOpenSub(key, e.currentTarget.getBoundingClientRect())
      return
    }
    itemRefs.current[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  return (
    <div className="section-carousel-wrap">
      <div className="section-carousel" ref={trackRef} onScroll={handleScroll}>
        <div className="section-carousel-spacer" aria-hidden="true" />
        {TABS.map((t, i) => {
          const Icon = t.Icon
          const active = i === centerIdx
          return (
            <button key={t.key} ref={(el) => { itemRefs.current[i] = el }}
              className={`section-carousel-item ${active ? 'active' : ''}`}
              aria-current={active} onClick={(e) => handleTap(i, e)}>
              <Icon size={active ? 17 : 14} />{t.label}
            </button>
          )
        })}
        <div className="section-carousel-spacer" aria-hidden="true" />
      </div>
    </div>
  )
}

function DashHeader({ tab, onSelectTab, onOpenSub }: { tab: Tab; onSelectTab: (key: Tab) => void; onOpenSub: (key: 'household' | 'bills', rect: DOMRect) => void }) {
  return (
    <header className="top">
      <NotificationBell />
      {/* Both occupy the same header slot — PagePill hides itself below 640px (mobile
         navigates via the bottom nav), which is exactly where SectionCarousel shows
         instead: swipe/tap to change section, replacing the long tabs row on mobile
         with something that fits between the bell and the gear. */}
      <div className="dash-header-center">
        <PagePill current="dashboard" />
        <SectionCarousel tab={tab} onSelectTab={onSelectTab} onOpenSub={onOpenSub} />
      </div>
      <HeaderNav current="dashboard" />
    </header>
  )
}

interface Stat { label: string; value: string; sub?: string; cls?: string }


// The headline figure, with whatever qualifies it on one quiet line beneath.
// This was briefly a panel of stat cards inside the card — a box in a box, and the
// stats it held (top source / top category / top account) were the first bar of the
// ranked chart two rows below, which shows all of them rather than just the biggest.
function HeroRow({ stats }: { stats: Stat[] }) {
  const [primary, ...rest] = stats
  return (
    <section className="block">
      <div className="card">
        <span className="hdr-label">{primary.label}</span>
        {/* the label anchors the card at the left; the figure and what qualifies it
            are centred together, so they read as one block rather than a stack */}
        <div className={`stat-value ${primary.cls || ''}`} style={{ letterSpacing: '-0.03em', marginTop: 4, whiteSpace: 'nowrap', textAlign: 'center' }}>{primary.value}</div>
        {rest.map((s) => (
          <div key={s.label} style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
            <b style={{ color: 'var(--text-secondary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s.value}</b>
            {` ${s.label.toLowerCase()}`}{s.sub ? ` · ${s.sub}` : ''}
          </div>
        ))}
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
  display: 'inline-flex', padding: 6, borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
}

function RecentList({ title, txns, emptyLabel, maxHeight }: { title: string; txns: Txn[]; emptyLabel: string; maxHeight?: number }) {
  const [editTx, setEditTx] = useState<Txn | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const { confirm, confirmNode } = useConfirm()
  const { toast, toastNode } = useToast()

  const refresh = () => window.dispatchEvent(new CustomEvent('transaction-added'))
  const del = (id: string) => {
    confirm({ title: 'Delete this transaction?', run: async () => {
      const res = await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })
      if (res.ok) refresh(); else toast('Could not delete.')
    } })
  }

  return (
    <section className="block" style={{ marginBottom: 64 }}>
      {confirmNode}{toastNode}
      <div className="card">
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
                  <span className={`stat-value ${t.type}`} style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>
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

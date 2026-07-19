'use client'

import { useEffect, useState } from 'react'
import HeaderNav from '@/components/HeaderNav'
import Logo from '@/components/Logo'
import JourneyCard from '@/components/JourneyCard'
import MoneyFlowCard from '@/components/MoneyFlowCard'
import { getJSON } from '@/lib/fresh'

interface Stats { currentBalance: number; savingsRate: number; transactionCount: number; asOf: string; totalSavings: number }
interface Month {
  label: string; income: number; expense: number; savings: number; net: number
  prevIncome: number; prevExpense: number; prevSavings: number
  categories: { name: string; total: number }[]
}

const money = (n: number) =>
  n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }) // to cents

const money0 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

// A small inset card for a "this month" figure: label · amount (colored) · tiny delta
function MonthCard({ label, value, prev, goodUp, cls }: { label: string; value?: number; prev?: number; goodUp: boolean; cls: string }) {
  const diff = value != null && prev != null ? value - prev : null
  const up = diff != null && diff > 0
  const good = up === goodUp
  return (
    <div style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 11px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</div>
      <div className={`stat-value ${cls}`} style={{ fontSize: 18, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value != null ? money0(value) : '—'}</div>
      {diff != null && Math.abs(diff) >= 1 && (
        <div style={{ fontSize: 11, fontWeight: 600, color: good ? 'var(--income)' : 'var(--expense)' }}>
          {up ? '▲' : '▼'} {money0(Math.abs(diff))}
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> vs last month</span>
        </div>
      )}
    </div>
  )
}

const prettyDate = (iso: string) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : ''

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [month, setMonth] = useState<Month | null>(null)

  useEffect(() => {
    const load = () => {
      getJSON('/api/stats').then((d) => !d.error && setStats(d)).catch(() => {})
      getJSON('/api/month').then((d) => !d.error && !d.empty && setMonth(d)).catch(() => {})
    }
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [])

  const bal = stats?.currentBalance ?? 0
  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <Logo />
            <span>Journey to 500K</span>
          </div>
          <HeaderNav current="home" />
        </header>

        {/* Headline hero — Net Worth + Journey/ETA to 500K, combined */}
        <section className="block">
          <JourneyCard />
        </section>

        {/* Current Balance + This Month (full width until its neighbour is decided) */}
        <section className="block">
          <div className="grid-2" style={{ gridTemplateColumns: '1fr' }}>
            <div className="card glass" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ margin: 0 }}>💵 Current Balance</h2>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 0' }}>
                <div style={{ fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', color: bal >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  {stats ? money(bal) : '—'}
                </div>
                <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>As of {today}</span>
              </div>

              {/* This month at a glance — fills the space below the divider */}
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ margin: '0 0 10px' }}>📊 This Month · {month ? month.label : '—'}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr', gap: 8, flex: 1 }}>
                  <MonthCard label="Income" value={month?.income} prev={month?.prevIncome} goodUp cls="income" />
                  <MonthCard label="Expenses" value={month?.expense} prev={month?.prevExpense} goodUp={false} cls="expense" />
                  <MonthCard label="Savings" value={month?.savings} prev={month?.prevSavings} goodUp cls="savings" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Money Flow — income vs expenses vs savings, defaults to YTD */}
        <section className="block">
          <MoneyFlowCard />
        </section>

        {/* Footer */}
        <footer style={{ textAlign: 'center', marginTop: 32, paddingBottom: 16 }}>
          {stats && (
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {stats.transactionCount.toLocaleString()} transactions tracked
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}

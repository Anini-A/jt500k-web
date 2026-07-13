'use client'

import { useEffect, useState } from 'react'
import ChatWidget from '@/components/ChatWidget'
import HeaderNav from '@/components/HeaderNav'
import NetWorthCard from '@/components/NetWorthCard'
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

// Month-over-month delta note. `goodUp` = is an increase a good thing?
function Delta({ now, prev, goodUp }: { now: number; prev: number; goodUp: boolean }) {
  if (!prev) return null
  const diff = now - prev
  if (Math.abs(diff) < 1) return <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 4 }}>— vs last month</div>
  const up = diff > 0
  const good = up === goodUp
  return (
    <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 4, color: good ? 'var(--income)' : 'var(--expense)' }}>
      {up ? '▲' : '▼'} {money0(Math.abs(diff))} vs last month
    </div>
  )
}

// A compact "this month" line: label · amount (colored) · tiny delta
function MonthLine({ label, value, prev, goodUp, cls }: { label: string; value?: number; prev?: number; goodUp: boolean; cls: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span className={`stat-value ${cls}`} style={{ fontSize: 16, fontWeight: 700 }}>{value != null ? money0(value) : '—'}</span>
        {value != null && prev != null && <Delta now={value} prev={prev} goodUp={goodUp} />}
      </div>
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
            <span>Journey to 500K</span>
          </div>
          <HeaderNav current="home" />
        </header>

        {/* Two-card headline: Net Worth (with the 500K tracker) · Current Balance */}
        <section className="block">
          <div className="grid-2">
            <NetWorthCard />
            <div className="card glass" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ margin: 0 }}>💵 Current Balance</h2>
              <div style={{ fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '10px 0 2px', color: bal >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                {stats ? money(bal) : '—'}
              </div>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>As of {today}</div>

              {/* This month at a glance */}
              <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
                <h2 style={{ margin: 0 }}>{month ? month.label : 'This month'}</h2>
                <MonthLine label="Income" value={month?.income} prev={month?.prevIncome} goodUp cls="income" />
                <MonthLine label="Expenses" value={month?.expense} prev={month?.prevExpense} goodUp={false} cls="expense" />
                <MonthLine label="Savings" value={month?.savings} prev={month?.prevSavings} goodUp cls="savings" />
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

      <ChatWidget />
    </div>
  )
}

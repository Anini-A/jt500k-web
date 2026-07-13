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

const prettyDate = (iso: string) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : ''

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [month, setMonth] = useState<Month | null>(null)
  const [netWorth, setNetWorth] = useState(0)

  useEffect(() => {
    const load = () => {
      getJSON('/api/stats').then((d) => !d.error && setStats(d)).catch(() => {})
      getJSON('/api/month').then((d) => !d.error && !d.empty && setMonth(d)).catch(() => {})
      getJSON('/api/networth').then((d) => !d.error && setNetWorth(Number(d.netWorth) || 0)).catch(() => {})
    }
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [])

  const bal = stats?.currentBalance ?? 0

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
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>💵 Current Balance</div>
              <div style={{ fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '10px 0 2px', color: bal >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                {stats ? money(bal) : '—'}
              </div>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {stats?.asOf ? `As of ${prettyDate(stats.asOf)}` : 'Cash on hand'}
              </div>
            </div>
          </div>
        </section>

        {/* This month summary — with month-over-month deltas */}
        <section className="block">
          <div className="card glass">
            <div className="stat-grid">
              <div className="stat-card">
                <div style={{ fontSize: 24, marginBottom: 8 }}>💰</div>
                <div className="stat-label">Income</div>
                <div className="stat-value income">{month ? money(month.income) : '—'}</div>
                {month && <Delta now={month.income} prev={month.prevIncome} goodUp />}
              </div>
              <div className="stat-card">
                <div style={{ fontSize: 24, marginBottom: 8 }}>💸</div>
                <div className="stat-label">Expenses</div>
                <div className="stat-value expense">{month ? money(month.expense) : '—'}</div>
                {month && <Delta now={month.expense} prev={month.prevExpense} goodUp={false} />}
              </div>
              <div className="stat-card">
                <div style={{ fontSize: 24, marginBottom: 8 }}>🏦</div>
                <div className="stat-label">Savings</div>
                <div className="stat-value savings">{month ? money(month.savings) : '—'}</div>
                {month && <Delta now={month.savings} prev={month.prevSavings} goodUp />}
              </div>
            </div>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, textAlign: 'center', marginTop: 14 }}>
              {month ? month.label : ''}
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

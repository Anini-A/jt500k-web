'use client'

import { useEffect, useState } from 'react'
import MonthChart from '@/components/MonthChart'
import ChatWidget from '@/components/ChatWidget'
import HeaderNav from '@/components/HeaderNav'
import { getJSON } from '@/lib/fresh'

interface Stats { currentBalance: number; savingsRate: number; transactionCount: number; asOf: string }
interface Month {
  label: string; income: number; expense: number; savings: number; net: number
  categories: { name: string; total: number }[]
}

const money = (n: number) =>
  n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }) // to cents

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

  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <span>Journey to 500K</span>
          </div>
          <HeaderNav current="home" />
        </header>

        {/* Hero — current balance to the cent */}
        <section className="block">
          <div className="card glass hero" style={{ textAlign: 'center' }}>
            <div className="stat-label">💵 Current Balance</div>
            <div style={{ fontSize: 48, fontWeight: 700, margin: '8px 0 4px', color: bal >= 0 ? 'var(--income)' : 'var(--expense)' }}>
              {stats ? money(bal) : '—'}
            </div>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {stats?.asOf ? `As of ${prettyDate(stats.asOf)}` : ''}
            </div>
          </div>
        </section>

        {/* This month summary */}
        <section className="block">
          <div className="card glass">
            <div className="stat-grid">
              <div className="stat-card">
                <div style={{ fontSize: 24, marginBottom: 8 }}>💰</div>
                <div className="stat-label">Income</div>
                <div className="stat-value income">{month ? money(month.income) : '—'}</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: 24, marginBottom: 8 }}>💸</div>
                <div className="stat-label">Expenses</div>
                <div className="stat-value expense">{month ? money(month.expense) : '—'}</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: 24, marginBottom: 8 }}>🏦</div>
                <div className="stat-label">Savings</div>
                <div className="stat-value savings">{month ? money(month.savings) : '—'}</div>
              </div>
            </div>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, textAlign: 'center', marginTop: 14 }}>
              {month ? month.label : ''}
            </div>
          </div>
        </section>

        {/* Current month expense breakdown */}
        <section className="block">
          <div className="card glass">
            <h2 style={{ marginTop: 0, marginBottom: 4 }}>This Month's Spending</h2>
            <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 16 }}>
              Expenses by category{month ? ` · ${month.label}` : ''}
            </p>
            {month ? <MonthChart categories={month.categories} /> : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer style={{ textAlign: 'center', marginTop: 32, paddingBottom: 16 }}>
          {stats && (
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {stats.transactionCount.toLocaleString()} transactions tracked
            </div>
          )}
          <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 4 }}>
            home page version <code>{(process.env.NEXT_PUBLIC_COMMIT_SHA || 'local').slice(0, 7)}</code>
          </div>
        </footer>
      </div>

      <ChatWidget />
    </div>
  )
}

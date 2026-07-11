'use client'

import { useEffect, useState } from 'react'
import MonthChart from '@/components/MonthChart'

interface Stats { currentBalance: number; savingsRate: number; transactionCount: number }
interface Month {
  label: string; income: number; expense: number; savings: number; net: number
  categories: { name: string; total: number }[]
}

const money = (n: number) =>
  n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }) // to cents

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [month, setMonth] = useState<Month | null>(null)

  useEffect(() => {
    fetch('/api/stats').then((r) => r.json()).then((d) => !d.error && setStats(d)).catch(() => {})
    fetch('/api/month').then((r) => r.json()).then((d) => !d.error && !d.empty && setMonth(d)).catch(() => {})
  }, [])

  const bal = stats?.currentBalance ?? 0

  return (
    <div className="bg-aurora">
      <header className="top">
        <div className="brand">
          <span className="brand-emoji">💵</span>
          <span>Journey to 500K</span>
        </div>
        <a className="header-cta" href="/settings">
          ⚙️ <span className="long">Settings</span>
        </a>
      </header>

      <div className="wrap">
        {/* Hero — current balance to the cent */}
        <section className="block">
          <div className="card glass hero" style={{ textAlign: 'center' }}>
            <div className="stat-label">💵 Current Balance</div>
            <div style={{ fontSize: 48, fontWeight: 700, margin: '8px 0', color: bal >= 0 ? 'var(--income)' : 'var(--expense)' }}>
              {stats ? money(bal) : '—'}
            </div>
            <p className="lead" style={{ margin: '0 auto 20px' }}>
              Income − Expenses − Savings set aside
            </p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <a className="btn btn-primary" href="/dashboard">📊 Open Dashboard</a>
            </div>
          </div>
        </section>

        {/* This month summary */}
        <section className="block">
          <h2>📅 {month ? month.label : 'This Month'}</h2>
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
              <div className="stat-card">
                <div style={{ fontSize: 24, marginBottom: 8 }}>⚖️</div>
                <div className="stat-label">Net</div>
                <div className="stat-value" style={{ color: (month?.net ?? 0) >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  {month ? money(month.net) : '—'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Current month expense breakdown */}
        <section className="block">
          <div className="card glass">
            <h2 style={{ marginTop: 0, marginBottom: 4 }}>🧮 This Month's Spending</h2>
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
          <span className="offer-badge">✅ Supabase Connected</span>
          {stats && (
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 8 }}>
              {stats.transactionCount.toLocaleString()} transactions tracked
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}

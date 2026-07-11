'use client'

import { useEffect, useState } from 'react'

interface Stats {
  totalIncome: number
  totalExpenses: number
  totalSavings: number
  savingsRate: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats')
        const data = await res.json()
        setStats(data)
      } catch (error) {
        console.error('Failed to fetch stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top glass">
          <div className="brand">
            <span className="brand-emoji">📊</span>
            <span>Dashboard</span>
          </div>
          <a className="header-cta" href="/">
            ← Back
          </a>
        </header>

        <section className="block">
          <h2>💰 Financial Overview</h2>
          {loading ? (
            <div className="card glass" style={{ padding: '40px', textAlign: 'center' }}>
              Loading your data...
            </div>
          ) : stats ? (
            <div className="card glass">
              <div className="stat-grid">
                <div className="stat-card">
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>💰</div>
                  <div className="stat-label">Total Income</div>
                  <div className="stat-value income">${(stats.totalIncome / 1000).toFixed(1)}K</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>💸</div>
                  <div className="stat-label">Total Expenses</div>
                  <div className="stat-value expense">${(stats.totalExpenses / 1000).toFixed(1)}K</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏦</div>
                  <div className="stat-label">Total Savings</div>
                  <div className="stat-value savings">${(stats.totalSavings / 1000).toFixed(1)}K</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>📈</div>
                  <div className="stat-label">Savings Rate</div>
                  <div className="stat-value">{stats.savingsRate}%</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card glass" style={{ padding: '40px', textAlign: 'center' }}>
              No data available. Add your first transaction!
            </div>
          )}
        </section>

        <section className="block">
          <div className="card glass hero" style={{ marginTop: '32px' }}>
            <h2 style={{ marginTop: 0, marginBottom: '16px' }}>🤖 AI Financial Assistant</h2>
            <p>Ask me questions about your spending, get budget recommendations, or receive personalized financial advice.</p>
            <div className="hero-actions">
              <button className="btn btn-primary" onClick={() => alert('Chat feature coming soon!')}>
                💬 Chat with Claude
              </button>
            </div>
          </div>
        </section>

        <section className="block" style={{ marginBottom: '64px' }}>
          <div className="card glass hero">
            <h2 style={{ marginTop: 0, marginBottom: '16px' }}>📊 Add Your First Transaction</h2>
            <p>Start tracking your income and expenses to see real-time insights on your dashboard.</p>
            <div className="hero-actions">
              <button className="btn btn-primary" onClick={() => alert('Transaction form coming soon!')}>
                ➕ Add Transaction
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

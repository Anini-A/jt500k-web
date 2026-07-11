'use client'

import { useEffect, useState, useCallback } from 'react'
import Charts from '@/components/Charts'
import GoalTracker from '@/components/GoalTracker'
import ChatWidget from '@/components/ChatWidget'

interface Stats {
  totalIncome: number
  totalExpenses: number
  totalSavings: number
  savingsRate: number
  currentBalance: number
  transactionCount: number
}

interface Transaction {
  id: string
  date: string
  description: string | null
  category: string | null
  type: string
  amount: number
}

interface Category {
  id: string
  name: string
  type: string
}

const money = (n: number) =>
  n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'expense',
    category: '',
    amount: '',
    description: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, t, c] = await Promise.all([
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/transactions?limit=15').then((r) => r.json()),
        fetch('/api/categories').then((r) => r.json()),
      ])
      if (!s.error) setStats(s)
      if (Array.isArray(t)) setTxns(t)
      if (Array.isArray(c)) setCats(c)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      })
      if (res.ok) {
        setForm({ ...form, amount: '', description: '' })
        setShowForm(false)
        load()
      } else {
        const err = await res.json()
        alert('Error: ' + (err.error || 'could not save'))
      }
    } finally {
      setSaving(false)
    }
  }

  const catsForType = cats.filter((c) => c.type === form.type)

  return (
    <div className="bg-aurora">
      <header className="top">
        <div className="brand">
          <span className="brand-emoji">📊</span>
          <span>Dashboard</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="header-cta" href="/settings" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>⚙️ <span className="long">Settings</span></a>
          <a className="header-cta" href="/">← <span className="long">Home</span></a>
        </div>
      </header>
      <div className="wrap">

        <section className="block">
          <h2>💰 Financial Overview</h2>
          {loading ? (
            <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Loading your data…</div>
          ) : stats && stats.transactionCount > 0 ? (
            <>
            <GoalTracker saved={stats.totalSavings} />
            <div className="card glass hero" style={{ marginBottom: 16, textAlign: 'center' }}>
              <div className="stat-label">💵 Current Balance</div>
              <div className="stat-value" style={{ fontSize: 44, color: stats.currentBalance >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                {money(stats.currentBalance)}
              </div>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                Income − Expenses − Savings set aside
              </div>
            </div>
            <div className="card glass">
              <div className="stat-grid">
                <div className="stat-card">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>💰</div>
                  <div className="stat-label">Total Income</div>
                  <div className="stat-value income">{money(stats.totalIncome)}</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>💸</div>
                  <div className="stat-label">Total Expenses</div>
                  <div className="stat-value expense">{money(stats.totalExpenses)}</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🏦</div>
                  <div className="stat-label">Total Savings</div>
                  <div className="stat-value savings">{money(stats.totalSavings)}</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📈</div>
                  <div className="stat-label">Savings Rate</div>
                  <div className="stat-value">{stats.savingsRate}%</div>
                </div>
              </div>
            </div>
            </>
          ) : (
            <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>
              No data yet. Add your first transaction below to get started!
            </div>
          )}
        </section>

        <section className="block">
          <div className="card glass">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showForm ? 16 : 0 }}>
              <h2 style={{ margin: 0 }}>➕ Add Transaction</h2>
              <button className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
                {showForm ? 'Cancel' : 'New'}
              </button>
            </div>

            {showForm && (
              <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span className="stat-label">Date</span>
                    <input type="date" required value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp} />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span className="stat-label">Type</span>
                    <select value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value, category: '' })} style={inp}>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                      <option value="savings">Savings</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span className="stat-label">Category</span>
                    <select value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })} style={inp}>
                      <option value="">— select —</option>
                      {catsForType.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span className="stat-label">Amount</span>
                    <input type="number" step="0.01" required placeholder="0.00" value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inp} />
                  </label>
                </div>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span className="stat-label">Description</span>
                  <input type="text" placeholder="e.g. Groceries" value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })} style={inp} />
                </label>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : '💾 Save Transaction'}
                </button>
              </form>
            )}
          </div>
        </section>

        {stats && stats.transactionCount > 0 && (
          <section className="block">
            <Charts />
          </section>
        )}

        <section className="block" style={{ marginBottom: 64 }}>
          <h2>🧾 Recent Transactions</h2>
          <div className="card glass">
            {txns.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>No transactions yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 2 }}>
                {txns.map((t) => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{t.description || t.category}</div>
                      <div className="stat-label">{t.date} · {t.category}</div>
                    </div>
                    <div className={`stat-value ${t.type}`} style={{ fontSize: 16 }}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money(Number(t.amount))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <ChatWidget />
    </div>
  )
}

const inp: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--kpi-bg)',
  color: 'var(--text-primary)',
  fontSize: 14,
}

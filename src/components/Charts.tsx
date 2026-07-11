'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell,
} from 'recharts'

interface Monthly {
  month: string
  income: number
  expense: number
  savings: number
  net: number
}
interface CatSlice { name: string; total: number }

const C = { income: '#1baf7a', expense: '#eb6834', savings: '#6366f1' }
const money = (n: number) => '$' + Math.round(n).toLocaleString()
const shortMonth = (m: string) => {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleString('en', { month: 'short' }) + " '" + y.slice(2)
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,.15)' }}>
      {label && <div style={{ fontWeight: 600, marginBottom: 4 }}>{typeof label === 'string' && label.includes('-') ? shortMonth(label) : label}</div>}
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color || p.fill }}>{p.name}: {money(p.value)}</div>
      ))}
    </div>
  )
}

export default function Charts() {
  const [monthly, setMonthly] = useState<Monthly[]>([])
  const [cats, setCats] = useState<CatSlice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/charts')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.monthly)) setMonthly(d.monthly)
        if (Array.isArray(d.categories)) setCats(d.categories.slice(0, 8))
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Loading charts…</div>
  }

  const axisStyle = { fontSize: 11, fill: 'var(--text-muted)' }

  return (
    <>
      <div className="card glass" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>📈 Monthly Trend</h2>
        <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 16 }}>Income vs Expenses vs Savings over time</p>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {(['income', 'expense', 'savings'] as const).map((k) => (
                <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C[k]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={C[k]} stopOpacity={0.03} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={shortMonth} tick={axisStyle} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis tickFormatter={(v) => '$' + (v / 1000) + 'k'} tick={axisStyle} tickLine={false} axisLine={false} width={44} />
            <Tooltip content={<ChartTip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="income" name="Income" stroke={C.income} fill="url(#g-income)" strokeWidth={2} />
            <Area type="monotone" dataKey="expense" name="Expenses" stroke={C.expense} fill="url(#g-expense)" strokeWidth={2} />
            <Area type="monotone" dataKey="savings" name="Savings" stroke={C.savings} fill="url(#g-savings)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="card glass">
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🧮 Top Expense Categories</h2>
        <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 16 }}>Where your money goes (all time)</p>
        <ResponsiveContainer width="100%" height={Math.max(220, cats.length * 40)}>
          <BarChart data={cats} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => '$' + (v / 1000) + 'k'} tick={axisStyle} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} width={80} />
            <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--border)', opacity: 0.3 }} />
            <Bar dataKey="total" name="Spent" radius={[0, 4, 4, 0]}>
              {cats.map((_, i) => <Cell key={i} fill={C.expense} fillOpacity={1 - i * 0.08} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

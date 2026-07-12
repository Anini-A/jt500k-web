'use client'

import { useEffect, useState, useCallback } from 'react'
import { getJSON } from '@/lib/fresh'

interface Txn { date: string; type: string; category: string | null; amount: number }
interface Env { category: string; type: string; budgeted: number; spent: number }

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const monthName = (m: string) => {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleString('en', { month: 'long', year: 'numeric' })
}

export default function InsightCard() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [envs, setEnvs] = useState<Env[]>([])

  const load = useCallback(() => {
    getJSON('/api/data').then((d) => Array.isArray(d) && setTxns(d.map((t: any) => ({ ...t, amount: Number(t.amount) })))).catch(() => {})
    getJSON('/api/budgets').then((d) => Array.isArray(d?.envelopes) && setEnvs(d.envelopes)).catch(() => {})
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
  }, [load])

  if (txns.length === 0) return null
  const months = [...new Set(txns.map((t) => t.date.slice(0, 7)))].sort()
  const cur = months[months.length - 1]
  const prev = months.length > 1 ? months[months.length - 2] : null

  const sumBy = (m: string, type: string) => txns.filter((t) => t.date.slice(0, 7) === m && t.type === type).reduce((s, t) => s + t.amount, 0)
  const rows = (['expense', 'income', 'savings'] as const).map((type) => {
    const now = sumBy(cur, type)
    const before = prev ? sumBy(prev, type) : 0
    const pct = before > 0 ? ((now - before) / before) * 100 : null
    return { type, now, before, pct }
  })
  const LABEL: Record<string, string> = { expense: '💸 Spending', income: '💰 Income', savings: '🏦 Savings' }
  const over = envs.filter((e) => e.type !== 'savings' && e.category !== 'Debt Repayment' && e.spent > e.budgeted)
    .sort((a, b) => (b.spent - b.budgeted) - (a.spent - a.budgeted))

  // For spending, up is bad; for income/savings, up is good.
  const good = (type: string, delta: number) => type === 'expense' ? delta <= 0 : delta >= 0

  return (
    <section className="block">
      <div className="card glass">
        <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>💡 This Month at a Glance</h3>
        <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 14 }}>
          {monthName(cur)}{prev ? ` vs ${monthName(prev)}` : ''}
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((r) => {
            const delta = r.now - r.before
            const g = good(r.type, delta)
            return (
              <div key={r.type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600 }}>{LABEL[r.type]}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ fontWeight: 700 }}>{money(r.now)}</span>
                  {prev && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: g ? 'var(--income)' : 'var(--expense)' }}>
                      {delta >= 0 ? '▲' : '▼'} {money(Math.abs(delta))}{r.pct != null ? ` (${Math.abs(r.pct).toFixed(0)}%)` : ''}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
        {over.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div className="stat-label" style={{ marginBottom: 6 }}>⚠️ Over budget</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {over.map((e) => (
                <span key={e.category} style={{ background: 'var(--expense-soft)', color: 'var(--expense)', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                  {e.category} +{money(e.spent - e.budgeted)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

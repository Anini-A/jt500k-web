'use client'

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'

interface CatSlice { name: string; total: number }

const EXPENSE = '#eb6834'
const money = (n: number) => '$' + Math.round(n).toLocaleString()

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ color: EXPENSE }}>{money(payload[0].value)}</div>
    </div>
  )
}

export default function MonthChart({ categories }: { categories: CatSlice[] }) {
  const data = categories.slice(0, 8)
  if (data.length === 0) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>No expenses recorded this month.</div>
  }
  const axisStyle = { fontSize: 11, fill: 'var(--text-muted)' }
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => '$' + (v / 1000).toFixed(1) + 'k'} tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} width={80} />
        <Tooltip content={<Tip />} cursor={{ fill: 'var(--border)', opacity: 0.3 }} />
        <Bar dataKey="total" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => <Cell key={i} fill={EXPENSE} fillOpacity={1 - i * 0.09} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

'use client'

import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'

export const COLORS = {
  income: '#1baf7a',
  expense: '#eb6834',
  savings: '#6366f1',
}
// categorical palette for accounts / breakdowns
export const PALETTE = ['#2a78d6', '#1baf7a', '#eb6834', '#8a5cf6', '#e0a12b', '#d9488a', '#2bb3b3', '#7a869a']

const money = (n: number) => '$' + Math.round(n).toLocaleString()
export const shortMonth = (m: string) => {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleString('en', { month: 'short' }) + " '" + y.slice(2)
}

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,.15)' }}>
      {label != null && <div style={{ fontWeight: 600, marginBottom: 4 }}>{typeof label === 'string' && /^\d{4}-\d{2}/.test(label) ? shortMonth(label) : label}</div>}
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color || p.fill }}>{p.name}: {money(p.value)}</div>
      ))}
    </div>
  )
}

const axisStyle = { fontSize: 11, fill: 'var(--text-muted)' }

export function MonthlyArea({ data, series, height = 260 }: {
  data: any[]
  series: { key: string; name: string; color: string }[]
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`ga-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tickFormatter={shortMonth} tick={axisStyle} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => '$' + (v / 1000) + 'k'} tick={axisStyle} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<Tip />} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={`url(#ga-${s.key})`} strokeWidth={2} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function HBar({ data, color = COLORS.expense }: { data: { name: string; total: number }[]; color?: string }) {
  if (!data.length) return <Empty />
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} width={84} />
        <Tooltip content={<Tip />} cursor={{ fill: 'var(--border)', opacity: 0.3 }} />
        <Bar dataKey="total" name="Amount" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => <Cell key={i} fill={color} fillOpacity={1 - i * 0.08} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function Donut({ data, height = 260 }: { data: { name: string; total: number }[]; height?: number }) {
  if (!data.length) return <Empty />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} stroke="var(--surface-1)" strokeWidth={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip content={<Tip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function Empty() {
  return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No data in this period.</div>
}

'use client'

// Native <select> category picker — the iOS wheel picker closes reliably and
// keeps type context via optgroups. (Was a custom dropdown that stuck open on iOS.)
const GROUPS = [
  { type: 'income', label: 'Income' },
  { type: 'expense', label: 'Expense' },
  { type: 'savings', label: 'Savings' },
]

export default function CategorySelect({ value, onChange, cats, placeholder = '— select —' }: {
  value: string
  onChange: (v: string) => void
  cats: { name: string; type: string }[]
  placeholder?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{
        height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
        background: 'var(--kpi-bg)', color: value ? 'var(--text-primary)' : 'var(--text-muted)',
        fontSize: 14, width: '100%', fontFamily: 'inherit', boxSizing: 'border-box',
      }}>
      <option value="">{placeholder}</option>
      {GROUPS.map((g) => {
        const items = cats.filter((c) => c.type === g.type)
        if (!items.length) return null
        return (
          <optgroup key={g.type} label={g.label}>
            {items.map((c) => <option key={c.name} value={c.name} style={{ color: 'var(--text-primary)' }}>{c.name}</option>)}
          </optgroup>
        )
      })}
    </select>
  )
}

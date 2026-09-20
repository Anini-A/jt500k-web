'use client'

import { useEffect, useState } from 'react'

// Native <select> category picker — the iOS wheel picker closes reliably and
// keeps type context via optgroups. (Was a custom dropdown that stuck open on iOS.)
//
// Safari 27 / iOS 27 added `appearance: base-select`, which finally makes the
// control and its dropdown stylable, so on those browsers we render richer options
// (a type swatch per row) and let globals.css dress the picker to match the sheet.
// It is an opt-in upgrade rather than a replacement: `base-select` swaps the iOS
// wheel for an in-page popover, so anything older keeps the native picker exactly
// as it was. The check runs after mount because the server can't know the answer —
// rendering the rich markup during SSR would mismatch on hydration.
const GROUPS = [
  { type: 'income', label: 'Income' },
  { type: 'expense', label: 'Expense' },
  { type: 'savings', label: 'Savings' },
]

const TYPE_COLOR: Record<string, string> = {
  income: 'var(--income)',
  expense: 'var(--expense)',
  savings: 'var(--savings)',
}

export function useBaseSelect() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    try { setOk(CSS.supports('appearance', 'base-select')) } catch { /* old browser */ }
  }, [])
  return ok
}

export default function CategorySelect({ value, onChange, cats, placeholder = '— select —' }: {
  value: string
  onChange: (v: string) => void
  cats: { name: string; type: string }[]
  placeholder?: string
}) {
  const rich = useBaseSelect()
  const selected = cats.find((c) => c.name === value)

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={rich ? `base-select${value ? '' : ' is-placeholder'}` : undefined}
      style={rich ? undefined : {
        height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
        background: 'var(--kpi-bg)', color: value ? 'var(--text-primary)' : 'var(--text-muted)',
        fontSize: 14, width: '100%', fontFamily: 'inherit', boxSizing: 'border-box',
      }}>
      {rich && (
        <button>
          {/* the closed control mirrors the selected <option>'s markup */}
          <selectedcontent />
        </button>
      )}
      <option value="">{placeholder}</option>
      {GROUPS.map((g) => {
        const items = cats.filter((c) => c.type === g.type)
        if (!items.length) return null
        return (
          <optgroup key={g.type} label={g.label}>
            {items.map((c) => (
              <option key={c.name} value={c.name} style={rich ? undefined : { color: 'var(--text-primary)' }}>
                {rich && <span className="cat-swatch" style={{ color: TYPE_COLOR[c.type] ?? 'var(--text-muted)' }} />}
                {c.name}
              </option>
            ))}
          </optgroup>
        )
      })}
      {/* a value that no longer exists in the list still has to render as itself */}
      {value && !selected && <option value={value}>{value}</option>}
    </select>
  )
}

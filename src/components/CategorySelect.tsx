'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

const PILL: Record<string, { bg: string; fg: string; label: string }> = {
  income: { bg: 'var(--income-soft)', fg: 'var(--income)', label: 'Income' },
  expense: { bg: 'var(--expense-soft)', fg: 'var(--expense)', label: 'Expense' },
  savings: { bg: 'var(--savings-soft)', fg: 'var(--savings)', label: 'Savings' },
}

export function TypePill({ type }: { type: string }) {
  const p = PILL[type] || PILL.expense
  return (
    <span style={{
      background: p.bg, color: p.fg, padding: '2px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, flexShrink: 0, lineHeight: '18px',
    }}>{p.label}</span>
  )
}

// Custom category picker — native <option> can't render pills.
export default function CategorySelect({ value, onChange, cats, placeholder = '— select —' }: {
  value: string
  onChange: (v: string) => void
  cats: { name: string; type: string }[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const sel = cats.find((c) => c.name === value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{
        height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
        background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
        fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, cursor: 'pointer', boxSizing: 'border-box',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sel ? sel.name : <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>}
          </span>
          {sel && <TypePill type={sel.type} />}
        </span>
        <ChevronDown size={16} style={{ flexShrink: 0, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {open && (
        <div className="glass" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
          borderRadius: 14, maxHeight: 280, overflowY: 'auto', padding: 6,
        }}>
          {cats.map((c) => (
            <button key={c.name} type="button"
              className={`cat-option${c.name === value ? ' cat-option-active' : ''}`}
              onClick={() => { onChange(c.name); setOpen(false) }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <TypePill type={c.type} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import { getJSON } from '@/lib/fresh'

interface Draft { rows: { card?: string; amount: string | number }[] }
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })

// Home card: each card's total of un-logged (saved-draft) transactions, at a glance.
export default function CardsToLogCard() {
  const [byCard, setByCard] = useState<{ card: string; total: number }[]>([])

  const load = useCallback(() => {
    getJSON('/api/drafts').then((d: Draft[]) => {
      if (!Array.isArray(d)) return
      const m = new Map<string, number>()
      for (const draft of d) for (const r of draft.rows || []) {
        const amt = parseFloat(String(r.amount)); if (isNaN(amt)) continue
        const card = r.card || 'Unassigned'
        m.set(card, (m.get(card) || 0) + amt)
      }
      setByCard([...m.entries()].map(([card, total]) => ({ card, total })).sort((a, b) => b.total - a.total))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('transaction-added', load)
    window.addEventListener('drafts-changed', load)
    return () => { window.removeEventListener('transaction-added', load); window.removeEventListener('drafts-changed', load) }
  }, [load])

  if (!byCard.length) return null
  const grand = byCard.reduce((s, c) => s + c.total, 0)

  return (
    <section className="block">
      <button onClick={() => window.dispatchEvent(new CustomEvent('open-add-import'))}
        className="card glass" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <span className="hdr-label">To log · {byCard.length} card{byCard.length !== 1 ? 's' : ''}</span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{money(grand)}</span>
        </div>
        <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
          {byCard.map((c) => (
            <div key={c.card} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <span style={{ color: c.card === 'Unassigned' ? 'var(--text-muted)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.card}</span>
              <span style={{ fontWeight: 600, flexShrink: 0 }}>{money(c.total)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 12, fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
          Review &amp; import <ChevronRight size={14} />
        </div>
      </button>
    </section>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Pencil } from 'lucide-react'
import { getJSON } from '@/lib/fresh'

interface Item { label: string; value: string }
interface Section { id: string; title: string; icon: string; items: Item[] }
interface Link { label: string; url: string }

// Read-only insurance view (edit lives in the Household tab).
export default function InsuranceView() {
  const [data, setData] = useState<{ sections: Section[]; links: Link[] } | null>(null)
  useEffect(() => { getJSON('/api/profile').then((d) => setData({ sections: d.sections || [], links: d.links || [] })).catch(() => setData({ sections: [], links: [] })) }, [])

  if (!data) return <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Loading…</div>

  const ins = data.sections.find((s) => s.id === 'insurance' || /insurance/i.test(s.title))
  const estate = data.sections.find((s) => s.id === 'estate' || /estate/i.test(s.title))
  const docLink = data.links.find((l) => /estate|beneficiar|doc/i.test(l.label))

  if (!ins && !estate) {
    return (
      <div className="card glass" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🛡️</div>
        <h3 style={{ margin: '0 0 6px' }}>No insurance details yet</h3>
        <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: 0 }}>Add them in the Household tab → Insurance section.</p>
      </div>
    )
  }

  const Card = ({ sec }: { sec: Section }) => (
    <div className="card glass">
      <h2 style={{ margin: '0 0 12px' }}>{sec.icon} {sec.title}</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {sec.items.map((it, i) => (
          <div key={i} style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 12px' }}>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{it.label}</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 3 }}>{it.value}</div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {ins && <Card sec={ins} />}
      {estate && <Card sec={estate} />}
      {docLink && (
        <a href={docLink.url} target="_blank" rel="noopener noreferrer" className="card glass" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--accent)', fontWeight: 600 }}>
          <ExternalLink size={16} /> {docLink.label}
        </a>
      )}
      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Pencil size={12} /> Edit these in the Household tab.
      </div>
    </div>
  )
}

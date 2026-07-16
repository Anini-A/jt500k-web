'use client'

import { useEffect, useState, useCallback } from 'react'
import { Pencil, Plus, Trash2, ExternalLink } from 'lucide-react'
import { getJSON } from '@/lib/fresh'

interface Item { label: string; value: string }
interface Section { id: string; icon: string; title: string; items: Item[] }
interface Profile { sections: Section[]; links: { label: string; url: string }[] }

const inp: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const isUrl = (v: string) => /^https?:\/\//i.test((v || '').trim())

export default function ProfilePanel() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Section | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    getJSON('/api/profile').then((d) => {
      const p: Profile = { sections: d.sections || [], links: d.links || [] }
      setProfile(p)
      setFilter((f) => f || p.sections[0]?.id || '')
    }).catch(() => setProfile({ sections: [], links: [] }))
  }, [])
  useEffect(() => { load() }, [load])

  if (!profile) return <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Loading household profile…</div>
  if (profile.sections.length === 0) return <div className="card glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No profile yet.</div>

  const shown = profile.sections.find((s) => s.id === filter) || profile.sections[0]
  const view = editing && draft ? draft : shown

  const startEdit = () => { setDraft(clone(shown)); setEditing(true) }
  const cancel = () => { setEditing(false); setDraft(null) }
  const upd = (fn: (d: Section) => void) => setDraft((d) => { const n = clone(d!); fn(n); return n })
  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const next: Profile = { ...profile, sections: profile.sections.map((s) => (s.id === draft.id ? draft : s)) }
      const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      if (res.ok) { setProfile(next); setEditing(false); setDraft(null) }
      else alert('Could not save: ' + ((await res.json()).error || 'error'))
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Section pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {profile.sections.map((s) => (
          <button key={s.id} className={`chip ${filter === s.id ? 'chip-active' : ''}`}
            onClick={() => { setFilter(s.id); cancel() }}>{s.icon} {s.title}</button>
        ))}
      </div>

      {/* The selected section as a card, with its own edit */}
      <div className="card glass">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {!editing && (
            <button aria-label="Edit section" title="Edit" onClick={startEdit}
              style={{ flexShrink: 0, padding: 7, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' }}>
              <Pencil size={15} />
            </button>
          )}
          {editing && draft ? (
            <>
              <input style={{ ...inp, width: 50, textAlign: 'center' }} value={draft.icon} onChange={(e) => upd((d) => { d.icon = e.target.value })} />
              <input style={{ ...inp, fontWeight: 700 }} value={draft.title} onChange={(e) => upd((d) => { d.title = e.target.value })} />
            </>
          ) : (
            <h2 style={{ margin: 0 }}>{shown.icon} {shown.title}</h2>
          )}
        </div>

        <div style={{ display: 'grid', gap: editing ? 8 : 2 }}>
          {view.items.map((it, ii) => editing && draft ? (
            <div key={ii} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input style={{ ...inp, flex: '0 0 34%' }} value={it.label} placeholder="Label" onChange={(e) => upd((d) => { d.items[ii].label = e.target.value })} />
              <textarea style={{ ...inp, flex: 1, minHeight: 38, resize: 'vertical' }} rows={1} value={it.value} placeholder="Value" onChange={(e) => upd((d) => { d.items[ii].value = e.target.value })} />
              <button aria-label="Remove row" onClick={() => upd((d) => { d.items.splice(ii, 1) })}
                style={{ flexShrink: 0, padding: 8, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={14} /></button>
            </div>
          ) : (
            <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: ii < view.items.length - 1 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
              <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, flex: '0 0 34%', minWidth: 130 }}>{it.label}</span>
              {isUrl(it.value) ? (
                <a href={it.value} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: 600, display: 'inline-flex', gap: 5, justifyContent: 'flex-end', alignItems: 'center' }}>Open <ExternalLink size={13} /></a>
              ) : (
                <span style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: 500, minWidth: 0 }}>{it.value}</span>
              )}
            </div>
          ))}
        </div>

        {editing && draft && (
          <>
            <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => upd((d) => { d.items.push({ label: '', value: '' }) })}>
              <Plus size={14} /> Add row
            </button>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button className="btn" style={{ background: 'var(--expense-soft)', color: 'var(--expense)', border: '1px solid var(--expense)' }} onClick={cancel} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={save} disabled={saving}>{saving ? 'Saving…' : '💾 Save'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

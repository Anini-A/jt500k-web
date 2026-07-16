'use client'

import { useEffect, useState, useCallback } from 'react'
import { Pencil, Plus, Trash2, ExternalLink } from 'lucide-react'
import { getJSON } from '@/lib/fresh'

interface Item { label: string; value: string }
interface Section { id: string; icon: string; title: string; items: Item[] }
interface Link { label: string; url: string }
interface Profile { sections: Section[]; links: Link[] }

const inp: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}
const uid = () => Math.random().toString(36).slice(2, 8)
const clone = (p: Profile): Profile => JSON.parse(JSON.stringify(p))

export default function ProfilePanel() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    getJSON('/api/profile').then((d) => setProfile({ sections: d.sections || [], links: d.links || [] })).catch(() => setProfile({ sections: [], links: [] }))
  }, [])
  useEffect(() => { load() }, [load])

  const editing = draft !== null
  const start = () => setDraft(clone(profile!))
  const cancel = () => setDraft(null)
  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      if (res.ok) { setProfile(draft); setDraft(null) }
      else alert('Could not save: ' + ((await res.json()).error || 'error'))
    } finally { setSaving(false) }
  }

  // draft mutators
  const upd = (fn: (d: Profile) => void) => setDraft((d) => { const n = clone(d!); fn(n); return n })

  if (!profile) return <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Loading household profile…</div>

  const view = draft ?? profile

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>🪪 Household Profile</h2>
          <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: '4px 0 0' }}>
            Key facts the assistant uses to answer questions about your household.
          </p>
        </div>
        {editing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={cancel} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : '💾 Save'}</button>
          </div>
        ) : (
          <button className="btn btn-secondary" onClick={start}><Pencil size={15} /> Edit</button>
        )}
      </div>

      {view.sections.length === 0 && !editing && (
        <div className="card glass" style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>
          No profile yet. Tap Edit to add household details.
        </div>
      )}

      {view.sections.map((sec, si) => (
        <div key={sec.id || si} className="card glass">
          {editing ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input style={{ ...inp, width: 54, textAlign: 'center' }} value={sec.icon} onChange={(e) => upd((d) => { d.sections[si].icon = e.target.value })} />
              <input style={{ ...inp, fontWeight: 700 }} value={sec.title} onChange={(e) => upd((d) => { d.sections[si].title = e.target.value })} />
              <button aria-label="Remove section" onClick={() => upd((d) => { d.sections.splice(si, 1) })}
                style={{ flexShrink: 0, padding: 8, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--expense)', cursor: 'pointer' }}><Trash2 size={15} /></button>
            </div>
          ) : (
            <h2 style={{ margin: '0 0 12px' }}>{sec.icon} {sec.title}</h2>
          )}

          <div style={{ display: 'grid', gap: editing ? 8 : 2 }}>
            {sec.items.map((it, ii) => editing ? (
              <div key={ii} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input style={{ ...inp, flex: '0 0 34%' }} value={it.label} placeholder="Label" onChange={(e) => upd((d) => { d.sections[si].items[ii].label = e.target.value })} />
                <textarea style={{ ...inp, flex: 1, minHeight: 38, resize: 'vertical' }} rows={1} value={it.value} placeholder="Value" onChange={(e) => upd((d) => { d.sections[si].items[ii].value = e.target.value })} />
                <button aria-label="Remove row" onClick={() => upd((d) => { d.sections[si].items.splice(ii, 1) })}
                  style={{ flexShrink: 0, padding: 8, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={14} /></button>
              </div>
            ) : (
              <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: ii < sec.items.length - 1 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
                <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, flex: '0 0 34%', minWidth: 140 }}>{it.label}</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: 500, minWidth: 0 }}>{it.value}</span>
              </div>
            ))}
            {editing && (
              <button className="btn btn-secondary" style={{ justifySelf: 'start', marginTop: 4 }} onClick={() => upd((d) => { d.sections[si].items.push({ label: '', value: '' }) })}>
                <Plus size={14} /> Add row
              </button>
            )}
          </div>
        </div>
      ))}

      {editing && (
        <button className="btn btn-secondary" style={{ justifySelf: 'start' }}
          onClick={() => upd((d) => { d.sections.push({ id: uid(), icon: '📌', title: 'New section', items: [{ label: '', value: '' }] }) })}>
          <Plus size={15} /> Add section
        </button>
      )}

      {/* Links */}
      <div className="card glass">
        <h2 style={{ margin: '0 0 12px' }}>🔗 Documents & Links</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {view.links.map((l, li) => editing ? (
            <div key={li} style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inp, flex: '0 0 34%' }} value={l.label} placeholder="Label" onChange={(e) => upd((d) => { d.links[li].label = e.target.value })} />
              <input style={{ ...inp, flex: 1 }} value={l.url} placeholder="https://…" onChange={(e) => upd((d) => { d.links[li].url = e.target.value })} />
              <button aria-label="Remove link" onClick={() => upd((d) => { d.links.splice(li, 1) })}
                style={{ flexShrink: 0, padding: 8, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={14} /></button>
            </div>
          ) : (
            <a key={li} href={l.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: li < view.links.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <ExternalLink size={15} style={{ flexShrink: 0 }} /> {l.label}
            </a>
          ))}
          {editing && (
            <button className="btn btn-secondary" style={{ justifySelf: 'start', marginTop: 4 }} onClick={() => upd((d) => { d.links.push({ label: '', url: '' }) })}>
              <Plus size={14} /> Add link
            </button>
          )}
          {!editing && view.links.length === 0 && <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>No links yet.</span>}
        </div>
      </div>
    </div>
  )
}

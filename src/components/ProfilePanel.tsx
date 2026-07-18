'use client'

import { useEffect, useState, useCallback } from 'react'
import { Pencil, Plus, Trash2, ExternalLink, Users, Home, Shield, ScrollText, Flag, type LucideIcon } from 'lucide-react'
import { getJSON } from '@/lib/fresh'

type Status = 'todo' | 'doing' | 'done'
interface Item { label: string; value: string; status?: Status }

const STATUS: Record<Status, { label: string; fg: string; bg: string }> = {
  todo: { label: '⚠ To do', fg: 'var(--expense)', bg: 'var(--expense-soft)' },
  doing: { label: '◔ In progress', fg: 'var(--accent)', bg: 'var(--accent-soft)' },
  done: { label: '✓ Done', fg: 'var(--income)', bg: 'var(--income-soft)' },
}
function StatusChip({ status }: { status: Status }) {
  const s = STATUS[status]
  return <span style={{ background: s.bg, color: s.fg, padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{s.label}</span>
}
interface Section { id: string; icon: string; title: string; items: Item[] }
interface Profile { sections: Section[]; links: { label: string; url: string }[] }

// lucide icon + short tab label per known section (matches the dashboard tabs)
const SECTION_META: Record<string, { Icon: LucideIcon; short: string }> = {
  members: { Icon: Users, short: 'Members' },
  home: { Icon: Home, short: 'Mortgage' },
  insurance: { Icon: Shield, short: 'Insurance' },
  estate: { Icon: ScrollText, short: 'Estate' },
  goals: { Icon: Flag, short: 'Goals' },
}

// Same owner colour system as the Investments panel
const OWNER_COLOR: Record<string, { fg: string; bg: string; initials: string }> = {
  Jean: { fg: 'var(--accent)', bg: 'var(--accent-soft)', initials: 'JA' },
  Henriette: { fg: 'var(--savings)', bg: 'var(--savings-soft)', initials: 'HF' },
  Noah: { fg: 'var(--income)', bg: 'var(--income-soft)', initials: 'NN' },
  Joint: { fg: '#b7791f', bg: 'rgba(224,161,43,0.16)', initials: 'JT' },
}

// best-effort money parsing from free-text values
function parseAmounts(text: string): number[] {
  const out: number[] = []
  const re = /\$\s?([\d,]+(?:\.\d+)?)\s?([KM])?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    let n = parseFloat(m[1].replace(/,/g, ''))
    const u = (m[2] || '').toUpperCase()
    if (u === 'K') n *= 1e3
    if (u === 'M') n *= 1e6
    out.push(n)
  }
  return out
}
const parseMoney = (t: string) => parseAmounts(t)[0] || 0
const moneyShort = (n: number) => n >= 1e6 ? '$' + +(n / 1e6).toFixed(2) + 'M' : n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n)
const isPersonLabel = (label: string) => /^(jean|henriette|noah|nono|dependent)\b/i.test(label)
function detectOwner(text: string): string | null {
  const t = ` ${text.toLowerCase()} `
  if (/\bhenriette\b|\bhf\b/.test(t)) return 'Henriette'
  if (/\bjean\b|\bja\b/.test(t)) return 'Jean'
  if (/\bnoah\b|\bnono\b/.test(t)) return 'Noah'
  if (/\bjoint\b/.test(t)) return 'Joint'
  return null
}
function cleanLabel(label: string, owner: string): string {
  return label
    .replace(new RegExp(`^${owner}\\b`, 'i'), '').trim()
    .replace(/^[—–\-:]\s*/, '').trim()
    .replace(/^\([^)]*\)\s*/, '').trim()
}
const todoRe = /pending|none yet|not (yet|done|set up|submitted|completed)|to (do|submit|update|complete|sign)|missing|no will|no poa|⚠️/i

function OwnerPill({ owner }: { owner: string }) {
  const c = OWNER_COLOR[owner] || { fg: 'var(--text-secondary)', bg: 'var(--kpi-bg)' }
  return <span style={{ background: c.bg, color: c.fg, padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{owner}</span>
}
function StatusPill({ open }: { open: boolean }) {
  return <span style={{ background: open ? 'var(--expense-soft)' : 'var(--income-soft)', color: open ? 'var(--expense)' : 'var(--income)', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{open ? '⚠ Open' : '✓ Done'}</span>
}
function Summary({ big, label }: { big: string; label: string }) {
  return (
    <div style={{ marginBottom: 12, padding: '12px 14px', background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 'clamp(22px, 6vw, 28px)', letterSpacing: '-0.02em' }}>{big}</div>
      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>{label}</div>
    </div>
  )
}
function ReadinessMeter({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  const allDone = done === total && total > 0
  return (
    <div style={{ marginBottom: 12, padding: '12px 14px', background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Estate readiness</span>
        <span style={{ fontWeight: 700, color: allDone ? 'var(--income)' : 'var(--text-secondary)' }}>{allDone ? '✓ ' : ''}{done} of {total} in place</span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-1)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: allDone ? 'var(--income)' : 'linear-gradient(90deg, var(--savings), var(--income))', transition: 'width .6s ease' }} />
      </div>
    </div>
  )
}

// Goal horizon → colour + timeline dot
const HORIZON: Record<string, { fg: string; bg: string }> = {
  short: { fg: 'var(--income)', bg: 'var(--income-soft)' },
  medium: { fg: '#b7791f', bg: 'rgba(224,161,43,0.16)' },
  long: { fg: 'var(--savings)', bg: 'var(--savings-soft)' },
}
const detectHorizon = (label: string) => { const t = label.toLowerCase(); return /short/.test(t) ? 'short' : /medium|mid/.test(t) ? 'medium' : /long/.test(t) ? 'long' : null }

// Insurance grouped into per-person cards (Jean / Henriette) + a shared card
function InsuranceRow({ it, first }: { it: Item; first: boolean }) {
  const o = detectOwner(it.label)
  const cl = (o ? cleanLabel(it.label, o) : it.label) || it.label
  const open = it.status === undefined ? todoRe.test(String(it.value || '')) : false
  return (
    <div style={{ borderTop: first ? 'none' : '1px solid var(--border)', paddingTop: first ? 0 : 8, marginTop: first ? 0 : 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{cl}</span>
        {it.status ? <StatusChip status={it.status} /> : open ? <StatusPill open /> : null}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3, overflowWrap: 'anywhere' }}>{it.value}</div>
    </div>
  )
}
function InsurancePersonCards({ items }: { items: Item[] }) {
  const owners = ['Jean', 'Henriette']
  const groups: Record<string, Item[]> = {}
  const shared: Item[] = []
  for (const it of items) {
    const o = detectOwner(it.label)
    if (o && owners.includes(o)) (groups[o] ||= []).push(it)
    else shared.push(it)
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {owners.filter((o) => groups[o]?.length).map((o) => {
        const meta = OWNER_COLOR[o]
        return (
          <div key={o} style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderLeft: `3px solid ${meta.fg}`, borderRadius: 12, padding: '12px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: meta.bg, color: meta.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{meta.initials}</div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{o}</span>
            </div>
            {groups[o].map((it, i) => <InsuranceRow key={i} it={it} first={i === 0} />)}
          </div>
        )
      })}
      {shared.length > 0 && (
        <div style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 13px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🏠 Shared</div>
          {shared.map((it, i) => <InsuranceRow key={i} it={it} first={i === 0} />)}
        </div>
      )}
    </div>
  )
}

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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
      {/* Section menu — same segmented tab style as the dashboard */}
      <section style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="tabs">
          {profile.sections.map((s) => {
            const meta = SECTION_META[s.id]
            return (
              <button key={s.id} className={`tab ${filter === s.id ? 'tab-active' : ''}`}
                onClick={() => { setFilter(s.id); cancel() }}>
                {meta ? <meta.Icon size={16} /> : <span>{s.icon}</span>} {meta?.short || s.title}
              </button>
            )
          })}
        </div>
      </section>

      {/* The selected section as a card, with its own edit */}
      <div className="card glass">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, justifyContent: 'space-between' }}>
          {editing && draft ? (
            <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 0 }}>
              <input style={{ ...inp, width: 50, textAlign: 'center' }} value={draft.icon} onChange={(e) => upd((d) => { d.icon = e.target.value })} />
              <input style={{ ...inp, fontWeight: 700 }} value={draft.title} onChange={(e) => upd((d) => { d.title = e.target.value })} />
            </div>
          ) : (
            <>
              <h2 style={{ margin: 0, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {(() => { const meta = SECTION_META[shown.id]; return meta ? <meta.Icon size={20} /> : <span>{shown.icon}</span> })()} {shown.title}
              </h2>
              <button aria-label="Edit section" title="Edit" onClick={startEdit}
                style={{ flexShrink: 0, padding: 7, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' }}>
                <Pencil size={15} />
              </button>
            </>
          )}
        </div>

        {/* Section summary (members: combined income · insurance: total coverage) */}
        {!editing && shown.id === 'members' && (() => {
          const income = shown.items.reduce((s, it) => { const o = detectOwner(`${it.label} ${it.value}`); return (o === 'Jean' || o === 'Henriette') ? s + parseMoney(it.value) : s }, 0)
          return income > 0 ? <Summary big={`~${moneyShort(income)}`} label="combined household income" /> : null
        })()}
        {!editing && shown.id === 'insurance' && (() => {
          const cov = shown.items.reduce((s, it) => { const amts = parseAmounts(it.value).filter((a) => a >= 50000); const mult = /\beach\b|×\s?2|x2/i.test(it.value) ? 2 : 1; return s + amts.reduce((a, b) => a + b, 0) * mult }, 0)
          return cov > 0 ? <Summary big={`≈ ${moneyShort(cov)}`} label="total life coverage" /> : null
        })()}
        {!editing && shown.id === 'estate' && (() => {
          const tracked = shown.items.filter((it) => !isUrl(it.value))
          const done = tracked.filter((it) => it.status ? it.status === 'done' : !todoRe.test(String(it.value || ''))).length
          return tracked.length ? <ReadinessMeter done={done} total={tracked.length} /> : null
        })()}

        {!editing && shown.id === 'insurance' ? (
          <InsurancePersonCards items={view.items} />
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          {view.items.map((it, ii) => editing && draft ? (
            <div key={ii} style={{ display: 'grid', gap: 6, padding: 8, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-1)' }}>
              <input style={inp} value={it.label} placeholder="Label" onChange={(e) => upd((d) => { d.items[ii].label = e.target.value })} />
              <textarea style={{ ...inp, minHeight: 38, resize: 'vertical' }} rows={1} value={it.value} placeholder="Value" onChange={(e) => upd((d) => { d.items[ii].value = e.target.value })} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <select value={it.status || ''} onChange={(e) => upd((d) => { const v = e.target.value; if (v) d.items[ii].status = v as Status; else delete d.items[ii].status })}
                  style={{ ...inp, width: 'auto', flex: 1, maxWidth: 200 }}>
                  <option value="">— no status —</option>
                  <option value="todo">⚠ To do</option>
                  <option value="doing">◔ In progress</option>
                  <option value="done">✓ Done</option>
                </select>
                <button aria-label="Remove row" onClick={() => upd((d) => { d.items.splice(ii, 1) })}
                  style={{ flexShrink: 0, padding: 8, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--expense)', cursor: 'pointer' }}><Trash2 size={14} /></button>
              </div>
            </div>
          ) : (() => {
            // Members: render each person as an avatar card
            if (shown.id === 'members' && isPersonLabel(it.label)) {
              const owner = detectOwner(it.label) || detectOwner(it.value) || 'Joint'
              const meta = OWNER_COLOR[owner]
              const cl = cleanLabel(it.label, owner)
              return (
                <div key={ii} style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderLeft: `3px solid ${meta.fg}`, borderRadius: 12, padding: '11px 12px', minWidth: 0, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: meta.bg, color: meta.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{meta.initials}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{owner}</span>
                      {cl && <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>· {cl}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3, overflowWrap: 'anywhere' }}>{it.value}</div>
                  </div>
                </div>
              )
            }
            // Goals: horizon-coloured timeline node
            if (shown.id === 'goals') {
              const h = detectHorizon(it.label)
              const hz = h ? HORIZON[h] : null
              return (
                <div key={ii} style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderLeft: hz ? `3px solid ${hz.fg}` : '1px solid var(--border)', borderRadius: 12, padding: '11px 12px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {hz ? (
                      <span style={{ background: hz.bg, color: hz.fg, padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{it.label}</span>
                    ) : (
                      <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{it.label}</span>
                    )}
                    {it.status && <StatusChip status={it.status} />}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{it.value}</div>
                </div>
              )
            }
            // Insurance: owner pill + label; Estate: status pill; else plain
            const owner = shown.id === 'insurance' ? detectOwner(it.label) : null
            const cl = owner ? cleanLabel(it.label, owner) : it.label
            // explicit status wins; else fall back to text detection on estate items
            const estateOpen = (it.status === undefined && shown.id === 'estate') ? todoRe.test(String(it.value || '')) : null
            return (
              <div key={ii} style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderLeft: owner ? `3px solid ${OWNER_COLOR[owner].fg}` : '1px solid var(--border)', borderRadius: 12, padding: '11px 12px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {owner && <OwnerPill owner={owner} />}
                  {cl && <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{cl}</span>}
                  {it.status && <StatusChip status={it.status} />}
                  {estateOpen !== null && <StatusPill open={estateOpen} />}
                </div>
                {isUrl(it.value) ? (
                  <a href={it.value} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, fontWeight: 600 }}>Open <ExternalLink size={13} /></a>
                ) : (
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{it.value}</div>
                )}
              </div>
            )
          })())}
        </div>
        )}

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

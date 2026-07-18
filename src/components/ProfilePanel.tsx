'use client'

import { useEffect, useState, useCallback } from 'react'
import { Pencil, Plus, Trash2, ExternalLink, Users, Home, Shield, ScrollText, Flag, type LucideIcon } from 'lucide-react'
import { getJSON } from '@/lib/fresh'

type Status = 'todo' | 'doing' | 'done'
interface Field { label: string; value: string }
interface Item { label: string; value?: string; status?: Status; fields?: Field[] }
interface Section { id: string; icon: string; title: string; items: Item[] }
interface Profile { sections: Section[]; links: { label: string; url: string }[] }

const inp: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const isUrl = (v: string) => /^https?:\/\//i.test((v || '').trim())
const todoRe = /pending|none yet|not (yet|done|set up|submitted|completed)|to (do|submit|update|complete|sign)|missing|no will|no poa|⚠️/i

// section → lucide icon + short tab label (matches dashboard tabs)
const SECTION_META: Record<string, { Icon: LucideIcon; short: string }> = {
  members: { Icon: Users, short: 'Members' },
  home: { Icon: Home, short: 'Mortgage' },
  insurance: { Icon: Shield, short: 'Insurance' },
  estate: { Icon: ScrollText, short: 'Estate' },
  goals: { Icon: Flag, short: 'Goals' },
}

// owner colour system (shared with Investments)
const OWNER_COLOR: Record<string, { fg: string; bg: string; initials: string }> = {
  Jean: { fg: 'var(--accent)', bg: 'var(--accent-soft)', initials: 'JA' },
  Henriette: { fg: 'var(--savings)', bg: 'var(--savings-soft)', initials: 'HF' },
  Noah: { fg: 'var(--income)', bg: 'var(--income-soft)', initials: 'NN' },
  Joint: { fg: '#b7791f', bg: 'rgba(224,161,43,0.16)', initials: 'JT' },
}
function detectOwner(text: string): string | null {
  const t = ` ${text.toLowerCase()} `
  if (/\bhenriette\b|\bhf\b/.test(t)) return 'Henriette'
  if (/\bjean\b|\bja\b/.test(t)) return 'Jean'
  if (/\bnoah\b|\bnono\b/.test(t)) return 'Noah'
  if (/\bjoint\b/.test(t)) return 'Joint'
  return null
}
const detectProvider = (label: string) => {
  const t = label.toLowerCase()
  if (/policy\s?me/.test(t)) return { name: 'PolicyMe', icon: '🛡️' }
  if (/\bia\b|industrial|workplace|group/.test(t)) return { name: 'IA · Industrial Alliance', icon: '🏢' }
  return { name: 'Other', icon: '📄' }
}

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
const itemText = (it: Item) => [it.value, ...(it.fields || []).map((f) => f.value)].filter(Boolean).join(' ')
const parseMoney = (t: string) => parseAmounts(t)[0] || 0
const moneyShort = (n: number) => n >= 1e6 ? '$' + +(n / 1e6).toFixed(2) + 'M' : n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n)
const isPerson = (it: Item) => !!(it.fields && it.fields.length) && /^(jean|henriette|noah|nono|dependent)\b/i.test(it.label)

const HORIZON: Record<string, { fg: string; bg: string }> = {
  short: { fg: 'var(--income)', bg: 'var(--income-soft)' },
  medium: { fg: '#b7791f', bg: 'rgba(224,161,43,0.16)' },
  long: { fg: 'var(--savings)', bg: 'var(--savings-soft)' },
}
const detectHorizon = (label: string) => { const t = label.toLowerCase(); return /short/.test(t) ? 'short' : /medium|mid/.test(t) ? 'medium' : /long/.test(t) ? 'long' : null }

function StatusChip({ status }: { status: Status }) {
  const meta = { todo: { l: '⚠ To do', fg: 'var(--expense)', bg: 'var(--expense-soft)' }, doing: { l: '◔ In progress', fg: 'var(--accent)', bg: 'var(--accent-soft)' }, done: { l: '✓ Done', fg: 'var(--income)', bg: 'var(--income-soft)' } }[status]
  return <span style={{ background: meta.bg, color: meta.fg, padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{meta.l}</span>
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
function Avatar({ owner, size = 34 }: { owner: string; size?: number }) {
  const m = OWNER_COLOR[owner] || { fg: 'var(--text-secondary)', bg: 'var(--kpi-bg)', initials: owner.slice(0, 2).toUpperCase() }
  return <div style={{ width: size, height: size, borderRadius: '50%', background: m.bg, color: m.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>{m.initials}</div>
}

// Wealthsimple-style label → value rows
function FieldRows({ rows }: { rows: { label: string; value: string; status?: Status }[] }) {
  return (
    <div>
      {rows.map((r, i) => {
        const open = r.status === undefined && todoRe.test(String(r.value || ''))
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</span>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'right', overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: 0, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {r.status ? <StatusChip status={r.status} /> : open ? <StatusChip status="todo" /> : null}
              {isUrl(r.value) ? <a href={r.value} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontWeight: 600 }}>Open <ExternalLink size={13} /></a> : r.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function PersonCard({ item }: { item: Item }) {
  const owner = detectOwner(item.label) || detectOwner(itemText(item)) || 'Joint'
  const meta = OWNER_COLOR[owner]
  return (
    <div style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderLeft: `3px solid ${meta.fg}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Avatar owner={owner} />
        <span style={{ fontWeight: 700, fontSize: 15 }}>{item.label}</span>
        {item.status && <StatusChip status={item.status} />}
      </div>
      <FieldRows rows={item.fields || []} />
    </div>
  )
}

function MembersView({ items }: { items: Item[] }) {
  const people = items.filter(isPerson)
  const facts = items.filter((it) => !isPerson(it)).map((it) => ({ label: it.label, value: it.value || '', status: it.status }))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      {people.map((p, i) => <PersonCard key={i} item={p} />)}
      {facts.length > 0 && (
        <div style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
          <FieldRows rows={facts} />
        </div>
      )}
    </div>
  )
}

function InsuranceByProvider({ items }: { items: Item[] }) {
  const groups = new Map<string, { icon: string; items: Item[] }>()
  for (const it of items) {
    const p = detectProvider(it.label)
    if (!groups.has(p.name)) groups.set(p.name, { icon: p.icon, items: [] })
    groups.get(p.name)!.items.push(it)
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      {[...groups.entries()].map(([name, g]) => (
        <div key={name} style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{g.icon} {name}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
            {g.items.map((it, i) => {
              const owner = detectOwner(it.label)
              const meta = owner ? OWNER_COLOR[owner] : null
              return (
                <div key={i} style={{ borderLeft: meta ? `3px solid ${meta.fg}` : '1px solid var(--border)', paddingLeft: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    {owner && <Avatar owner={owner} size={26} />}
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{owner || it.label}</span>
                    {it.status && <StatusChip status={it.status} />}
                  </div>
                  <FieldRows rows={it.fields || (it.value ? [{ label: 'Details', value: it.value }] : [])} />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function GoalsView({ items }: { items: Item[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      {items.map((it, i) => {
        const h = detectHorizon(it.label)
        const hz = h ? HORIZON[h] : null
        return (
          <div key={i} style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderLeft: hz ? `3px solid ${hz.fg}` : '1px solid var(--border)', borderRadius: 12, padding: '11px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {hz ? <span style={{ background: hz.bg, color: hz.fg, padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{it.label}</span>
                : <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{it.label}</span>}
              {it.status && <StatusChip status={it.status} />}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6, overflowWrap: 'anywhere' }}>{it.value}</div>
          </div>
        )
      })}
    </div>
  )
}

// find a value across a section's items (and their fields) by label pattern
function findVal(section: Section | undefined, re: RegExp): string {
  for (const it of section?.items || []) {
    if (re.test(it.label) && it.value) return it.value
    for (const f of it.fields || []) if (re.test(f.label)) return f.value
  }
  return ''
}
const money0 = (n: number) => '$' + Math.round(n).toLocaleString()

function HouseholdHero({ profile, netWorth }: { profile: Profile; netWorth: number | null }) {
  const sec = (id: string) => profile.sections.find((s) => s.id === id)
  const members = sec('members'), ins = sec('insurance'), estate = sec('estate'), home = sec('home')
  const people = (members?.items || []).filter(isPerson)
  const income = (members?.items || []).reduce((s, it) => { const o = detectOwner(it.label); return (o === 'Jean' || o === 'Henriette') ? s + parseMoney(itemText(it)) : s }, 0)
  const location = findVal(members, /location/i)
  const coverage = (ins?.items || []).reduce((s, it) => s + parseAmounts(itemText(it)).filter((a) => a >= 50000).reduce((a, b) => a + b, 0), 0)
  const tracked = (estate?.items || []).filter((it) => !isUrl(it.value || ''))
  const done = tracked.filter((it) => it.status ? it.status === 'done' : !todoRe.test(String(it.value || ''))).length
  const homeVal = parseMoney(findVal(home, /valuation|home value|market value/i))
  const mortBal = parseMoney(findVal(home, /mortgage balance|outstanding|balance/i))
  const equity = homeVal && mortBal ? homeVal - mortBal : 0
  const ltv = homeVal ? Math.round((mortBal / homeVal) * 100) : 0

  const tiles = [
    { label: 'Net worth', value: netWorth != null ? money0(netWorth) : '…', color: 'var(--savings)' },
    { label: 'Combined income', value: income ? `~${moneyShort(income)}` : '—', color: 'var(--income)' },
    { label: 'Life coverage', value: coverage ? `≈ ${moneyShort(coverage)}` : '—', color: 'var(--text-primary)' },
    { label: 'Estate ready', value: tracked.length ? `${done}/${tracked.length}` : '—', color: done === tracked.length && tracked.length ? 'var(--income)' : 'var(--expense)' },
  ]
  return (
    <div className="card glass">
      {/* roster */}
      {people.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ display: 'flex' }}>
            {people.map((p, i) => { const o = detectOwner(p.label) || 'Joint'; return <div key={i} style={{ marginLeft: i ? -8 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--surface-1)' }}><Avatar owner={o} size={38} /></div> })}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{people.map((p) => p.label).join(' · ')}</div>
            {location && <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{location}</div>}
          </div>
        </div>
      )}

      {/* KPI tiles — 2×2 on phones, 4-across on wider screens */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 12px' }}>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{t.label}</div>
            <div style={{ fontWeight: 800, fontSize: 'clamp(18px, 5vw, 22px)', color: t.color, marginTop: 3, letterSpacing: '-0.02em' }}>{t.value}</div>
          </div>
        ))}
      </div>

      {/* home equity */}
      {homeVal > 0 && (
        <div style={{ marginTop: 12, padding: '11px 12px', background: 'var(--kpi-bg)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
            <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>🏠 Home equity</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: equity < 0 ? 'var(--expense)' : 'inherit' }}>{equity < 0 ? '−' : ''}{money0(Math.abs(equity))} <span style={{ color: ltv > 100 ? 'var(--expense)' : 'var(--text-muted)', fontWeight: 500 }}>· LTV {ltv}%</span></span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-1)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(0, Math.min(100, 100 - ltv))}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--savings), var(--income))' }} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProfilePanel() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Section | null>(null)
  const [saving, setSaving] = useState(false)
  const [netWorth, setNetWorth] = useState<number | null>(null)

  const load = useCallback(() => {
    getJSON('/api/profile').then((d) => {
      const p: Profile = { sections: d.sections || [], links: d.links || [] }
      setProfile(p); setFilter((f) => f || p.sections[0]?.id || '')
    }).catch(() => setProfile({ sections: [], links: [] }))
    getJSON('/api/networth').then((d) => !d.error && setNetWorth(Number(d.netWorth) || 0)).catch(() => {})
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

  // section summaries
  const membersIncome = shown.id === 'members' ? shown.items.reduce((s, it) => { const o = detectOwner(it.label); return (o === 'Jean' || o === 'Henriette') ? s + parseMoney(itemText(it)) : s }, 0) : 0
  const coverage = shown.id === 'insurance' ? shown.items.reduce((s, it) => s + parseAmounts(itemText(it)).filter((a) => a >= 50000).reduce((a, b) => a + b, 0), 0) : 0
  const estateTracked = shown.id === 'estate' ? shown.items.filter((it) => !isUrl(it.value || '')) : []
  const estateDone = estateTracked.filter((it) => it.status ? it.status === 'done' : !todoRe.test(String(it.value || ''))).length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
      {/* HQ hero — roster + live KPIs + home equity */}
      <HouseholdHero profile={profile} netWorth={netWorth} />

      {/* Section menu — dashboard tab style */}
      <section style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="tabs">
          {profile.sections.map((s) => {
            const meta = SECTION_META[s.id]
            return (
              <button key={s.id} className={`tab ${filter === s.id ? 'tab-active' : ''}`} onClick={() => { setFilter(s.id); cancel() }}>
                {meta ? <meta.Icon size={16} /> : <span>{s.icon}</span>} {meta?.short || s.title}
              </button>
            )
          })}
        </div>
      </section>

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

        {/* summaries */}
        {!editing && membersIncome > 0 && <Summary big={`~${moneyShort(membersIncome)}`} label="combined household income" />}
        {!editing && coverage > 0 && <Summary big={`≈ ${moneyShort(coverage)}`} label="total life coverage" />}
        {!editing && shown.id === 'estate' && estateTracked.length > 0 && <ReadinessMeter done={estateDone} total={estateTracked.length} />}

        {/* view */}
        {editing && draft ? (
          <ItemsEditor section={draft} upd={upd} />
        ) : shown.id === 'members' ? <MembersView items={view.items} />
          : shown.id === 'insurance' ? <InsuranceByProvider items={view.items} />
          : shown.id === 'goals' ? <GoalsView items={view.items} />
          : <FieldRows rows={view.items.map((it) => ({ label: it.label, value: it.value || '', status: it.status }))} />}

        {editing && draft && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <button className="btn" style={{ background: 'var(--expense-soft)', color: 'var(--expense)', border: '1px solid var(--expense)' }} onClick={cancel} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={save} disabled={saving}>{saving ? 'Saving…' : '💾 Save'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- editor (handles both atomic value items and field-based items) ----
function ItemsEditor({ section, upd }: { section: Section; upd: (fn: (d: Section) => void) => void }) {
  const statusSel = (val: Status | undefined, on: (v: Status | undefined) => void) => (
    <select value={val || ''} onChange={(e) => on((e.target.value || undefined) as Status | undefined)} style={{ ...inp, width: 'auto', flex: 1, maxWidth: 170 }}>
      <option value="">— no status —</option>
      <option value="todo">⚠ To do</option>
      <option value="doing">◔ In progress</option>
      <option value="done">✓ Done</option>
    </select>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      {section.items.map((it, ii) => (
        <div key={ii} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-1)' }}>
          <input style={{ ...inp, fontWeight: 700 }} value={it.label} placeholder="Name / label" onChange={(e) => upd((d) => { d.items[ii].label = e.target.value })} />

          {it.fields && it.fields.length ? (
            <>
              {it.fields.map((f, fi) => (
                <div key={fi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input style={{ ...inp, flex: '0 0 38%' }} value={f.label} placeholder="Field" onChange={(e) => upd((d) => { d.items[ii].fields![fi].label = e.target.value })} />
                  <input style={{ ...inp, flex: 1 }} value={f.value} placeholder="Value" onChange={(e) => upd((d) => { d.items[ii].fields![fi].value = e.target.value })} />
                  <button aria-label="Remove field" onClick={() => upd((d) => { d.items[ii].fields!.splice(fi, 1) })} style={{ flexShrink: 0, padding: 8, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={13} /></button>
                </div>
              ))}
              <button className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => upd((d) => { (d.items[ii].fields ||= []).push({ label: '', value: '' }) })}><Plus size={13} /> Add field</button>
            </>
          ) : (
            <textarea style={{ ...inp, minHeight: 38, resize: 'vertical' }} rows={1} value={it.value || ''} placeholder="Value" onChange={(e) => upd((d) => { d.items[ii].value = e.target.value })} />
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            {statusSel(it.status, (v) => upd((d) => { if (v) d.items[ii].status = v; else delete d.items[ii].status }))}
            <div style={{ display: 'flex', gap: 8 }}>
              {!it.fields && <button className="btn btn-secondary" onClick={() => upd((d) => { d.items[ii].fields = [{ label: '', value: '' }] })}><Plus size={13} /> Fields</button>}
              <button className="btn" style={{ background: 'var(--expense-soft)', color: 'var(--expense)', border: '1px solid var(--expense)' }} onClick={() => upd((d) => { d.items.splice(ii, 1) })}><Trash2 size={14} /></button>
            </div>
          </div>
        </div>
      ))}
      <button className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => upd((d) => { d.items.push({ label: '', value: '' }) })}><Plus size={14} /> Add item</button>
    </div>
  )
}

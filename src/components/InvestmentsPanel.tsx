'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Upload, RefreshCw, Plus, Pencil, Trash2, LineChart } from 'lucide-react'
import { Donut } from './DashCharts'
import { getJSON } from '@/lib/fresh'

interface Holding {
  id: string; owner: string; account_type: string; account_number: string
  symbol: string; name: string | null; currency: string
  quantity: number; market_price: number; book_value_cad: number; market_value_cad: number; as_of: string | null
}
interface Asset { id: string; owner: string; name: string; kind: string | null; value_cad: number }

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const money2 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
const OWNER_ORDER = ['Jean', 'Henriette', 'Joint', 'Noah']
const OWNERS = ['Jean', 'Henriette', 'Joint', 'Noah']

const OWNER_COLOR: Record<string, { fg: string; bg: string }> = {
  Jean: { fg: 'var(--accent)', bg: 'var(--accent-soft)' },
  Henriette: { fg: 'var(--savings)', bg: 'var(--savings-soft)' },
  Noah: { fg: 'var(--income)', bg: 'var(--income-soft)' },
  Joint: { fg: '#b7791f', bg: 'rgba(224,161,43,0.16)' },
}
function OwnerPill({ owner }: { owner: string }) {
  const c = OWNER_COLOR[owner] || { fg: 'var(--text-secondary)', bg: 'var(--kpi-bg)' }
  return <span style={{ background: c.bg, color: c.fg, padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{owner}</span>
}

const inp: React.CSSProperties = {
  height: 40, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

// ---- Wealthsimple CSV parser ----
function parseCSVLine(line: string): string[] {
  const out: string[] = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = '' } else cur += c }
  }
  out.push(cur); return out
}

function parseHoldingsCSV(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const asOfM = text.match(/As of\s+(\d{4}-\d{2}-\d{2})/)
  const asOf = asOfM ? asOfM[1] : new Date().toISOString().slice(0, 10)
  const rows: any[] = []
  for (const line of lines) {
    const c = parseCSVLine(line)
    if (c[0] === 'Account Name' || !c[4] || c[0]?.startsWith('As of')) continue
    const num = (s: string) => parseFloat((s || '').replace(/[^0-9.\-]/g, ''))
    const mvCur = (c[18] || 'CAD').trim()
    const marketValue = num(c[17])
    const bookCAD = num(c[13])
    const bookMarket = num(c[15])
    let mvCAD = marketValue
    if (mvCur !== 'CAD') {
      const fx = bookMarket > 0 ? bookCAD / bookMarket : 1.395
      mvCAD = marketValue * fx
    }
    rows.push({
      account_type: (c[1] || '').trim(),
      account_number: (c[3] || '').split(',')[0].trim(),
      symbol: (c[4] || '').trim(),
      name: (c[7] || '').trim() || null,
      currency: (c[12] || 'CAD').trim(),
      quantity: num(c[9]),
      market_price: num(c[11]),
      book_value_cad: Math.round(bookCAD * 100) / 100,
      market_value_cad: Math.round(mvCAD * 100) / 100,
      as_of: asOf,
    })
  }
  return rows
}

export default function InvestmentsPanel() {
  const [data, setData] = useState<{ rows: Holding[]; assets: Asset[]; totalValue: number; totalCost: number; ownerTotals: Record<string, number>; asOf: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [person, setPerson] = useState('Household')
  const [importing, setImporting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  const load = useCallback(async () => {
    const d = await getJSON('/api/holdings').catch(() => null)
    if (d && !d.error) setData(d)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const REFRESH_KEY = 'jt-holdings-refreshed-at'
  const refresh = useCallback(async (silent = false) => {
    setRefreshing(true)
    if (!silent) setRefreshMsg('')
    try {
      const r = await fetch('/api/holdings/refresh', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { if (!silent) setRefreshMsg('Refresh failed — showing last import.'); return }
      try { localStorage.setItem(REFRESH_KEY, String(Date.now())) } catch { /* ignore */ }
      await load()
      window.dispatchEvent(new CustomEvent('transaction-added'))
      const failed = d.failed?.length ? ` · ${d.failed.length} kept from CSV (${d.failed.join(', ')})` : ''
      setRefreshMsg(d.updated ? `Live prices updated: ${d.updated} holding${d.updated !== 1 ? 's' : ''}${failed}` : 'Could not reach the price feed — showing last import.')
    } catch {
      if (!silent) setRefreshMsg('Refresh failed — showing last import.')
    } finally { setRefreshing(false) }
  }, [load])

  // Auto-refresh: on open if prices are stale (>15 min), then every 15 min while viewing.
  useEffect(() => {
    if (!data?.rows?.length) return
    const last = Number(localStorage.getItem(REFRESH_KEY) || 0)
    if (Date.now() - last > 15 * 60 * 1000) refresh(true)
    const id = setInterval(() => refresh(true), 15 * 60 * 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.rows?.length, refresh])

  const rows = data?.rows ?? []
  const assets = data?.assets ?? []
  const owners = useMemo(() => OWNER_ORDER.filter((o) => rows.some((r) => r.owner === o) || assets.some((a) => a.owner === o)), [rows, assets])
  const shown = person === 'Household' ? rows : rows.filter((r) => r.owner === person)
  const shownAssets = person === 'Household' ? assets : assets.filter((a) => a.owner === person)

  const holdingsValue = shown.reduce((s, h) => s + h.market_value_cad, 0)
  const holdingsCost = shown.reduce((s, h) => s + h.book_value_cad, 0)
  const assetsValue = shownAssets.reduce((s, a) => s + a.value_cad, 0)
  const value = holdingsValue + assetsValue
  const cost = holdingsCost + assetsValue
  const gain = holdingsValue - holdingsCost
  const gainPct = holdingsCost > 0 ? (gain / holdingsCost) * 100 : 0

  // group by account
  const accounts = useMemo(() => {
    const m = new Map<string, { key: string; label: string; owner: string; value: number; cost: number; holds: Holding[] }>()
    for (const h of shown) {
      const key = h.account_number
      if (!m.has(key)) m.set(key, { key, label: h.account_type, owner: h.owner, value: 0, cost: 0, holds: [] })
      const a = m.get(key)!; a.value += h.market_value_cad; a.cost += h.book_value_cad; a.holds.push(h)
    }
    return [...m.values()].sort((a, b) => b.value - a.value)
  }, [shown])

  const donut = accounts.map((a) => ({ name: a.label, total: Math.round(a.value) }))
  if (assetsValue > 0) donut.push({ name: 'Other Assets', total: Math.round(assetsValue) })

  const changeAsset = async (method: string, body?: any, qs = '') => {
    const res = await fetch('/api/assets' + qs, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    if (res.ok) { await load(); window.dispatchEvent(new CustomEvent('transaction-added')) }
    else alert('Error: ' + ((await res.json()).error || 'failed'))
  }

  if (loading) return <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Loading portfolio…</div>

  if (rows.length === 0 && assets.length === 0) {
    return (
      <div className="card glass" style={{ textAlign: 'center', padding: 40 }}>
        <LineChart size={34} color="var(--text-muted)" style={{ margin: '0 auto 10px' }} />
        <h3 style={{ margin: '0 0 6px' }}>No holdings yet</h3>
        <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 16 }}>Import your Wealthsimple holdings CSV to get started.</p>
        <button className="btn btn-primary" onClick={() => setImporting(true)} style={{ margin: '0 auto' }}><Upload size={16} /> Import Holdings</button>
        {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); window.dispatchEvent(new CustomEvent('transaction-added')) }} />}
      </div>
    )
  }

  return (
    <>
      {/* Person filter */}
      <div className="card glass" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Household', ...owners].map((o) => (
            <button key={o} className={`chip ${person === o ? 'chip-active' : ''}`} onClick={() => setPerson(o)}>{o}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => refresh(false)} disabled={refreshing}>
            <RefreshCw size={15} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} /> {refreshing ? 'Refreshing…' : 'Refresh Prices'}
          </button>
          <button className="btn btn-secondary" onClick={() => setImporting(true)}><Upload size={15} /> Update Holdings</button>
        </div>
      </div>
      {refreshMsg && <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: -8, marginBottom: 16, textAlign: 'center' }}>{refreshMsg}</div>}

      {/* Hero — AUM + gain + owner split */}
      <div className="card glass" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, minHeight: 20 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Portfolio value{person !== 'Household' ? ` · ${person}` : ''}</span>
          {data?.asOf && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>As of {data.asOf}</span>}
        </div>
        <div style={{ fontWeight: 700, fontSize: 'clamp(32px, 8vw, 44px)', color: 'var(--text-primary)', margin: '6px 0 4px', letterSpacing: '-0.03em' }}>{money(value)}</div>
        <div style={{ fontSize: 13, color: gain >= 0 ? 'var(--income)' : 'var(--expense)' }}>
          {gain >= 0 ? '↑' : '↓'} {money2(Math.abs(gain))} ({gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%) <span style={{ color: 'var(--text-muted)' }}>· cost {money(cost)}</span>
        </div>
        {person === 'Household' && owners.length > 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 'clamp(14px, 3vw, 28px)', marginTop: 20 }}>
            {owners.map((o) => {
              const c = OWNER_COLOR[o] || { fg: 'var(--text-secondary)', bg: 'var(--kpi-bg)' }
              return (
                <button key={o} onClick={() => setPerson(o)} style={{ textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', borderLeft: `2px solid ${c.fg}`, borderRadius: 0, padding: '2px 0 2px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: c.fg }}>{o}</div>
                  <div style={{ fontWeight: 600, fontSize: 16, marginTop: 3 }}>{money(data?.ownerTotals?.[o] || 0)}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Accounts — one card, sections divided */}
      <div className="card glass" style={{ marginBottom: 16 }}>
        {accounts.map((a, idx) => {
          const g = a.value - a.cost
          const gp = a.cost > 0 ? (g / a.cost) * 100 : 0
          const c = OWNER_COLOR[a.owner]
          return (
            <div key={a.key} style={{ paddingTop: idx ? 18 : 0, marginTop: idx ? 18 : 0, borderTop: idx ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c?.fg || 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{a.label}</span>
                  {person === 'Household' && <OwnerPill owner={a.owner} />}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{money(a.value)}</div>
                  <div style={{ fontSize: 12, color: g >= 0 ? 'var(--income)' : 'var(--expense)' }}>{g >= 0 ? '+' : ''}{money(g)} ({gp.toFixed(1)}%)</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, paddingLeft: 16 }}>
                {a.holds.slice().sort((x, y) => y.market_value_cad - x.market_value_cad).map((h, i) => {
                  const hg = h.market_value_cad - h.book_value_cad
                  return (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{h.symbol}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} sh{h.name ? ` · ${h.name}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 600 }}>{money2(h.market_value_cad)}</div>
                        <div style={{ fontSize: 13, color: hg >= 0 ? 'var(--income)' : 'var(--expense)' }}>{hg >= 0 ? '+' : ''}{money2(hg)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Allocation donut */}
      <div className="card glass" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>Allocation by account</h3>
        <Donut data={donut} />
      </div>

      {/* Other manual assets */}
      <OtherAssets assets={shownAssets} showOwner={person === 'Household'}
        onChange={changeAsset} defaultOwner={person !== 'Household' ? person : 'Jean'} />

      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); window.dispatchEvent(new CustomEvent('transaction-added')) }} />}
    </>
  )
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
}

// ---- Other (manual) assets card ----
function OtherAssets({ assets, showOwner, onChange, defaultOwner }: {
  assets: Asset[]; showOwner: boolean; defaultOwner: string
  onChange: (method: string, body?: any, qs?: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <div className="card glass" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Other Assets <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>· cash, options, etc.</span></h3>
        <button className="btn btn-secondary" onClick={() => { setAdding((v) => !v); setEditing(null) }}><Plus size={15} /> {adding ? 'Cancel' : 'Add'}</button>
      </div>
      {adding && <AssetForm defaultOwner={defaultOwner} onDone={async (p) => { await onChange('POST', p); setAdding(false) }} onCancel={() => setAdding(false)} />}
      {assets.length === 0 && !adding ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>No manual assets yet — add a chequing account, stock options, etc. (they count toward your AUM).</div>
      ) : (
        <div style={{ display: 'grid', gap: 2 }}>
          {assets.map((a) => editing === a.id ? (
            <AssetForm key={a.id} asset={a} defaultOwner={a.owner}
              onDone={async (p) => { await onChange('PATCH', { id: a.id, ...p }); setEditing(null) }}
              onDelete={async () => { if (confirm(`Delete "${a.name}"?`)) { await onChange('DELETE', undefined, `?id=${a.id}`); setEditing(null) } }}
              onCancel={() => setEditing(null)} />
          ) : (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600 }}>{a.name}</span>
                {a.kind && <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{a.kind}</span>}
                {showOwner && <OwnerPill owner={a.owner} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontWeight: 600 }}>{money2(a.value_cad)}</span>
                <button onClick={() => { setEditing(a.id); setAdding(false) }} aria-label="Edit" style={iconBtn}><Pencil size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AssetForm({ asset, defaultOwner, onDone, onDelete, onCancel }: {
  asset?: Asset; defaultOwner: string
  onDone: (p: { owner: string; name: string; kind: string; value: number }) => void
  onDelete?: () => void; onCancel?: () => void
}) {
  const [name, setName] = useState(asset?.name ?? '')
  const [kind, setKind] = useState(asset?.kind ?? '')
  const [owner, setOwner] = useState(asset?.owner ?? defaultOwner)
  const [value, setValue] = useState(asset ? String(asset.value_cad) : '')
  return (
    <div className="card" style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)', display: 'grid', gap: 10, margin: asset ? '4px 0' : '0 0 12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Name</span>
          <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chequing" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Kind</span>
          <input style={inp} value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Cash / Options" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Owner</span>
          <select style={inp} value={owner} onChange={(e) => setOwner(e.target.value)}>
            {OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Value ($)</span>
          <input style={inp} type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!name.trim() || !parseFloat(value)} onClick={() => onDone({ owner, name: name.trim(), kind, value: parseFloat(value) })}>{asset ? 'Save' : 'Add asset'}</button>
        {onCancel && <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
        {onDelete && <button className="btn btn-secondary" style={{ color: 'var(--expense)', borderColor: 'var(--expense)' }} onClick={onDelete}><Trash2 size={14} /> Delete</button>}
      </div>
    </div>
  )
}

// ---- Import modal ----
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [uploader, setUploader] = useState('Jean')
  const [rows, setRows] = useState<any[] | null>(null)
  const [saving, setSaving] = useState(false)

  const onFile = (f: File) => {
    const r = new FileReader()
    r.onload = () => setRows(parseHoldingsCSV(String(r.result || '')))
    r.readAsText(f)
  }

  const submit = async () => {
    if (!rows?.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploader, rows }),
      })
      if (res.ok) onDone()
      else alert('Error: ' + ((await res.json()).error || 'import failed'))
    } finally { setSaving(false) }
  }

  const total = (rows ?? []).reduce((s, r) => s + r.market_value_cad, 0)

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card glass" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><Upload size={18} /> Import Holdings</h2>
          <button className="modal-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Whose account is this?</span>
            <select value={uploader} onChange={(e) => setUploader(e.target.value)}
              style={{ height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit' }}>
              <option value="Jean">Jean (you)</option>
              <option value="Henriette">Henriette</option>
            </select>
            <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>RESP auto-tags to Noah · accounts shared with the other person become Joint.</span>
          </label>
          <label style={{ display: 'grid', gap: 4 }}><span className="stat-label">Wealthsimple holdings CSV</span>
            <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              style={{ fontSize: 14 }} /></label>
          {rows && (
            <div className="card" style={{ background: 'var(--kpi-bg)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600 }}>{rows.length} holdings · {money(total)}</div>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {[...new Set(rows.map((r) => r.account_type))].join(' · ')}
              </div>
            </div>
          )}
          <button className="btn btn-primary" disabled={saving || !rows?.length} onClick={submit} style={{ justifyContent: 'center' }}>
            {saving ? 'Importing…' : rows ? `Import ${rows.length} holdings` : 'Choose a CSV file'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

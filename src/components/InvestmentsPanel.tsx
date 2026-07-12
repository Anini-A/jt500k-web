'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Upload, RefreshCw } from 'lucide-react'
import { Donut } from './DashCharts'
import { getJSON } from '@/lib/fresh'

interface Holding {
  id: string; owner: string; account_type: string; account_number: string
  symbol: string; name: string | null; currency: string
  quantity: number; market_price: number; book_value_cad: number; market_value_cad: number; as_of: string | null
}

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const money2 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
const OWNER_ORDER = ['Jean', 'Henriette', 'Joint', 'Noah']

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
  const [data, setData] = useState<{ rows: Holding[]; totalValue: number; totalCost: number; ownerTotals: Record<string, number>; asOf: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [person, setPerson] = useState('Household')
  const [openAcct, setOpenAcct] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  const load = useCallback(async () => {
    const d = await getJSON('/api/holdings').catch(() => null)
    if (d && !d.error) setData(d)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const refresh = async () => {
    setRefreshing(true); setRefreshMsg('')
    try {
      const r = await fetch('/api/holdings/refresh', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setRefreshMsg('Refresh failed — showing last import.'); return }
      await load()
      window.dispatchEvent(new CustomEvent('transaction-added'))
      const failed = d.failed?.length ? ` · ${d.failed.length} kept from CSV (${d.failed.join(', ')})` : ''
      setRefreshMsg(d.updated ? `Live prices updated: ${d.updated} holding${d.updated !== 1 ? 's' : ''}${failed}` : 'Could not reach the price feed — showing last import.')
    } catch {
      setRefreshMsg('Refresh failed — showing last import.')
    } finally { setRefreshing(false) }
  }

  const rows = data?.rows ?? []
  const owners = useMemo(() => OWNER_ORDER.filter((o) => rows.some((r) => r.owner === o)), [rows])
  const shown = person === 'Household' ? rows : rows.filter((r) => r.owner === person)

  const value = shown.reduce((s, h) => s + h.market_value_cad, 0)
  const cost = shown.reduce((s, h) => s + h.book_value_cad, 0)
  const gain = value - cost
  const gainPct = cost > 0 ? (gain / cost) * 100 : 0

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

  if (loading) return <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Loading portfolio…</div>

  if (rows.length === 0) {
    return (
      <div className="card glass" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📈</div>
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
          <button className="btn btn-secondary" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={15} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} /> {refreshing ? 'Refreshing…' : 'Refresh Prices'}
          </button>
          <button className="btn btn-secondary" onClick={() => setImporting(true)}><Upload size={15} /> Update Holdings</button>
        </div>
      </div>
      {refreshMsg && <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: -8, marginBottom: 16, textAlign: 'center' }}>{refreshMsg}</div>}

      {/* Hero */}
      <div className="card glass" style={{ marginBottom: 16 }}>
        <div className="stat-grid">
          <div className="stat-card">
            <div style={{ fontSize: 24, marginBottom: 8 }}>💼</div>
            <div className="stat-label">Portfolio Value</div>
            <div className="stat-value savings">{money(value)}</div>
          </div>
          <div className="stat-card">
            <div style={{ fontSize: 24, marginBottom: 8 }}>🧾</div>
            <div className="stat-label">Cost Basis</div>
            <div className="stat-value">{money(cost)}</div>
          </div>
          <div className="stat-card">
            <div style={{ fontSize: 24, marginBottom: 8 }}>{gain >= 0 ? '📈' : '📉'}</div>
            <div className="stat-label">Unrealized Gain</div>
            <div className="stat-value" style={{ color: gain >= 0 ? 'var(--income)' : 'var(--expense)' }}>
              {gain >= 0 ? '+' : ''}{money(gain)}
            </div>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, color: gain >= 0 ? 'var(--income)' : 'var(--expense)' }}>
              {gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
            </div>
          </div>
        </div>
        {data?.asOf && <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 12, textAlign: 'center' }}>As of {data.asOf}{person !== 'Household' ? ` · ${person}` : ''}</div>}
      </div>

      <div className="grid-2">
        {/* Accounts accordion */}
        <div className="card glass">
          <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>Accounts</h3>
          <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 14 }}>Tap to see the holdings inside</p>
          <div style={{ display: 'grid', gap: 4 }}>
            {accounts.map((a) => {
              const g = a.value - a.cost
              const open = openAcct.has(a.key)
              return (
                <div key={a.key} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <button onClick={() => setOpenAcct((p) => { const n = new Set(p); n.has(a.key) ? n.delete(a.key) : n.add(a.key); return n })}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '8px 2px' }}>
                    <ChevronDown size={15} style={{ transition: 'transform .2s ease', transform: open ? 'none' : 'rotate(-90deg)', opacity: 0.55, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600 }}>{a.label}</span>
                    {person === 'Household' && <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>· {a.owner}</span>}
                    <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontWeight: 600 }}>{money(a.value)}</div>
                      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, color: g >= 0 ? 'var(--income)' : 'var(--expense)' }}>{g >= 0 ? '+' : ''}{money(g)}</div>
                    </span>
                  </button>
                  {open && (
                    <div style={{ display: 'grid', gap: 6, padding: '4px 4px 8px 25px' }}>
                      {a.holds.sort((x, y) => y.market_value_cad - x.market_value_cad).map((h) => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{h.symbol} <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>× {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></div>
                            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{h.name}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontWeight: 600 }}>{money2(h.market_value_cad)}</div>
                            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, color: h.market_value_cad - h.book_value_cad >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                              {h.market_value_cad - h.book_value_cad >= 0 ? '+' : ''}{money2(h.market_value_cad - h.book_value_cad)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Allocation donut */}
        <div className="card glass">
          <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>Allocation</h3>
          <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 14 }}>By account</p>
          <Donut data={donut} />
        </div>
      </div>

      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); window.dispatchEvent(new CustomEvent('transaction-added')) }} />}
    </>
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
          <h2 style={{ margin: 0, fontSize: 18 }}>📥 Import Holdings</h2>
          <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={onClose}>✕</button>
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
            {saving ? 'Importing…' : rows ? `💾 Import ${rows.length} holdings` : 'Choose a CSV file'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Pencil, Plus, Trash2, TriangleAlert, CheckCircle2, Wallet, CalendarClock } from 'lucide-react'
import { getJSON } from '@/lib/fresh'

interface Bill { id: string; name: string; day: number; amount: number; quarterly?: boolean; next_due?: string | null }
interface Settings { current_balance: number; balance_as_of: string | null; deposit_day: number; deposit_amount: number; buffer: number }

const num = (v: string) => parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0 // tolerates "$55.66", "1,234"
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const money2 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
const todayISO = () => new Date().toISOString().slice(0, 10)
const inp: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 16, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

// ── Projection engine ───────────────────────────────────────────────
// Walks day-by-day from the balance date forward, draining bills and adding
// the monthly deposit, to find the lowest point before the next paycheck.
interface DayPoint { date: Date; iso: string; balance: number; events: { name: string; amount: number; deposit?: boolean }[] }
interface Projection {
  series: DayPoint[]
  trough: DayPoint            // lowest balance before the next deposit
  nextDepositISO: string | null
  dueBeforeDeposit: { name: string; amount: number; iso: string }[]
  short: number               // >0 means you dip below the buffer by this much
}

function nextDateForDay(from: Date, day: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), 1)
  const inThis = new Date(from.getFullYear(), from.getMonth(), Math.min(day, daysInMonth(from.getFullYear(), from.getMonth())))
  if (inThis >= stripTime(from)) return inThis
  const y = from.getFullYear(), m = from.getMonth() + 1
  return new Date(y, m, Math.min(day, daysInMonth(y, m)))
}
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const stripTime = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const sameYMD = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function quarterlyHits(bill: Bill, from: Date, to: Date): Date[] {
  const out: Date[] = []
  if (!bill.next_due) return out
  const occ = stripTime(new Date(bill.next_due + 'T00:00:00'))
  for (let k = 0; k < 24; k++) {
    const d = new Date(occ.getFullYear(), occ.getMonth() + k * 3, occ.getDate())
    if (d > to) break
    if (d >= from) out.push(d)
  }
  return out
}

function project(bills: Bill[], s: Settings): Projection {
  const start = stripTime(new Date((s.balance_as_of || todayISO()) + 'T00:00:00'))
  const today = stripTime(new Date(todayISO() + 'T00:00:00'))
  const from = start < today ? today : start // never project into the past
  const DAYS = 42
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + DAYS)

  // pre-compute quarterly hit dates
  const qHits = new Map<string, Date[]>()
  bills.forEach((b) => { if (b.quarterly) qHits.set(b.id, quarterlyHits(b, from, to)) })

  let bal = Number(s.current_balance) || 0
  const series: DayPoint[] = []
  let nextDeposit: Date | null = null

  for (let i = 0; i <= DAYS; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
    const dom = d.getDate()
    const events: DayPoint['events'] = []
    // bills first (worst-case: money leaves before the deposit lands)
    for (const b of bills) {
      const hit = b.quarterly ? (qHits.get(b.id) || []).some((h) => sameYMD(h, d)) : dom === b.day
      if (hit) { bal -= Number(b.amount); events.push({ name: b.name, amount: Number(b.amount) }) }
    }
    // then the monthly deposit (skip day 0 so today's balance is the entered one)
    if (i > 0 && dom === s.deposit_day && s.deposit_amount > 0) {
      bal += Number(s.deposit_amount); events.push({ name: 'Paycheck deposit', amount: Number(s.deposit_amount), deposit: true })
      if (!nextDeposit) nextDeposit = d
    }
    series.push({ date: d, iso: d.toISOString().slice(0, 10), balance: Math.round(bal * 100) / 100, events })
  }

  // Danger window = up to the day BEFORE the next deposit (after it, you're refunded)
  const depIdx = nextDeposit ? series.findIndex((p) => sameYMD(p.date, nextDeposit!)) : series.length - 1
  const window = series.slice(0, depIdx >= 0 ? depIdx : series.length)
  let trough = window[0] || series[0]
  for (const p of window) if (p.balance < trough.balance) trough = p

  const dueBeforeDeposit = window.flatMap((p) => p.events.filter((e) => !e.deposit).map((e) => ({ name: e.name, amount: e.amount, iso: p.iso })))
  const short = Math.max(0, (Number(s.buffer) || 0) - trough.balance)

  return { series, trough, nextDepositISO: nextDeposit ? nextDeposit.toISOString().slice(0, 10) : null, dueBeforeDeposit, short }
}

// ── UI ──────────────────────────────────────────────────────────────
export default function BillRunway() {
  const [bills, setBills] = useState<Bill[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [editBalance, setEditBalance] = useState(false)
  const [editBill, setEditBill] = useState<Bill | 'new' | null>(null)

  const load = useCallback(async () => {
    const d = await getJSON('/api/bills').catch(() => null)
    if (d && !d.error) {
      setBills((d.bills || []).map((b: Bill) => ({ ...b, amount: Number(b.amount) })))
      setSettings({
        current_balance: Number(d.settings?.current_balance) || 0,
        balance_as_of: d.settings?.balance_as_of || null,
        deposit_day: Number(d.settings?.deposit_day) || 28,
        deposit_amount: Number(d.settings?.deposit_amount) || 0,
        buffer: Number(d.settings?.buffer) || 0,
      })
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const proj = useMemo(() => (settings ? project(bills, settings) : null), [bills, settings])

  if (loading) return <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Loading your bill runway…</div>
  if (!settings) return <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Could not load bills.</div>

  const monthlyTotal = bills.filter((b) => !b.quarterly).reduce((s, b) => s + b.amount, 0)
  const covered = proj ? proj.short <= 0 : true
  const asOf = settings.balance_as_of || todayISO()

  return (
    <div style={{ marginBottom: 64 }}>
      {/* VERDICT */}
      <div className="card glass" style={{ borderLeft: `4px solid ${covered ? 'var(--income)' : 'var(--expense)'}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {covered ? <CheckCircle2 size={26} color="var(--income)" style={{ flexShrink: 0, marginTop: 2 }} />
            : <TriangleAlert size={26} color="var(--expense)" style={{ flexShrink: 0, marginTop: 2 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 'clamp(18px, 4.5vw, 22px)', letterSpacing: '-0.01em' }}>
              {covered ? 'You’re covered' : `Short ${money2(proj!.short)}`}
            </div>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 3 }}>
              {proj && (covered
                ? <>Balance dips to <b style={{ color: 'var(--text-primary)' }}>{money2(proj.trough.balance)}</b> on {fmtDay(proj.trough.iso)}{proj.nextDepositISO ? `, before your ${fmtDay(proj.nextDepositISO)} deposit` : ''}.</>
                : <>On {fmtDay(proj.trough.iso)} the balance falls to <b style={{ color: 'var(--expense)' }}>{money2(proj.trough.balance)}</b>. Top up before then.</>)}
            </div>
          </div>
        </div>
      </div>

      {/* BALANCE + LEDGER — side by side */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card glass">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <Wallet size={20} color="var(--accent)" />
            <div>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Home &amp; Utilities balance · as of {fmtDay(asOf)}</div>
              <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em' }}>{money2(settings.current_balance)}</div>
            </div>
          </div>
          <button className={`chip btn-accent ${covered ? '' : 'btn-pulse'}`} onClick={() => setEditBalance(true)}>Update balance</button>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <MiniStat label="Monthly bills" value={money(monthlyTotal)} />
          <MiniStat label="Keep at least" value={money(monthlyTotal + settings.buffer)} accent />
          <MiniStat label="Next deposit" value={settings.deposit_amount ? `${money(settings.deposit_amount)} · ${depositDateLabel(settings.deposit_day)}` : depositDateLabel(settings.deposit_day)} />
        </div>
        </div>

        {/* UPCOMING LEDGER */}
        {proj && (
        <div className="card glass">
          <h3 style={{ margin: '0 0 4px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}><CalendarClock size={16} /> Coming out before your next deposit</h3>
          <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 14 }}>
            {proj.dueBeforeDeposit.length} bill{proj.dueBeforeDeposit.length === 1 ? '' : 's'} · {money2(proj.dueBeforeDeposit.reduce((s, e) => s + e.amount, 0))} total
          </p>
          {proj.dueBeforeDeposit.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Nothing due before your next deposit. 🎉</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 2 }}>
              {proj.dueBeforeDeposit.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 4px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                    <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>{fmtDay(e.iso)}</div>
                  </div>
                  <span className="stat-value expense" style={{ fontSize: 15, fontWeight: 700, flexShrink: 0 }}>−{money2(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* METER */}
      {proj && <Meter proj={proj} buffer={settings.buffer} />}

      {/* BILL SCHEDULE */}
      <div className="card glass" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Bill schedule</h3>
          <button className="chip" onClick={() => setEditBill('new')}><Plus size={14} style={{ marginRight: 4 }} />Add bill</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 8px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ width: 34, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>Day</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Description</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Amount</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 2 }}>
          {[...bills].sort((a, b) => a.day - b.day).map((b, i) => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 4px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--kpi-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{b.day}</span>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                  {b.quarterly && <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>Quarterly{b.next_due ? ` · next ${fmtDay(b.next_due)}` : ''}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{money2(b.amount)}</span>
                <button onClick={() => setEditBill(b)} aria-label="Edit" style={iconBtn}><Pencil size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 12, textAlign: 'center' }}>
        Ranged bills are modeled on their earliest possible day, so the runway is worst-case safe.
      </p>

      {editBalance && <BalanceModal settings={settings} onClose={() => setEditBalance(false)} onSaved={() => { setEditBalance(false); load() }} />}
      {editBill && <BillModal bill={editBill === 'new' ? null : editBill} onClose={() => setEditBill(null)} onSaved={() => { setEditBill(null); load() }} />}
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

// Day-by-day balance meter across the cycle
function Meter({ proj, buffer }: { proj: Projection; buffer: number }) {
  const pts = proj.series
  const [hover, setHover] = useState<number | null>(null)
  const min = Math.min(0, ...pts.map((p) => p.balance))
  const max = Math.max(...pts.map((p) => p.balance), buffer, 1)
  const span = max - min || 1
  const h = (v: number) => `${((v - min) / span) * 100}%`
  const depIso = proj.nextDepositISO
  const hp = hover != null ? pts[hover] : null
  return (
    <div className="card glass">
      <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Balance projection</h3>
      <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 14 }}>Projected balance each day · red = below your safe floor</p>
      <div onMouseLeave={() => setHover(null)}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 120, borderBottom: '1px solid var(--border)', position: 'relative' }}>
        {/* buffer line */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: h(buffer), borderTop: '1px dashed var(--text-muted)', opacity: 0.5 }} />
        {/* hover tooltip */}
        {hp && (
          <div style={{
            position: 'absolute', bottom: '100%', marginBottom: 8, zIndex: 5,
            left: `${((hover! + 0.5) / pts.length) * 100}%`,
            transform: `translateX(${hover! < pts.length * 0.15 ? '-8px' : hover! > pts.length * 0.85 ? '-92%' : '-50%'})`,
            background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '8px 10px', boxShadow: '0 8px 24px rgba(0,0,0,0.28)', pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{fmtDay(hp.iso)}</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: hp.balance < 0 ? 'var(--expense)' : hp.balance < buffer ? '#e0a12b' : 'var(--text-primary)' }}>{money2(hp.balance)}</div>
            {hp.events.map((e, k) => (
              <div key={k} style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {e.deposit ? '+ ' : '− '}{e.name} <b style={{ color: 'var(--text-primary)' }}>{money2(e.amount)}</b>
              </div>
            ))}
          </div>
        )}
        {pts.map((p, i) => {
          const low = p.balance < buffer
          const neg = p.balance < 0
          const isTrough = p.iso === proj.trough.iso
          const isDep = p.iso === depIso
          const hasBill = p.events.some((e) => !e.deposit)
          const active = hover === i
          return (
            <div key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}
              style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', cursor: 'pointer' }}>
              {hasBill && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: 'var(--expense)' }} />}
              {isDep && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: 'var(--income)' }} />}
              <div style={{
                height: h(Math.max(p.balance, min)), width: '100%', borderRadius: '2px 2px 0 0',
                background: neg ? 'var(--expense)' : low ? '#e0a12b' : 'var(--income)',
                outline: isTrough || active ? '1.5px solid var(--text-primary)' : 'none', opacity: active || isTrough ? 1 : 0.9,
              }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{fmtDay(pts[0].iso)}</span>
        <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{fmtDay(pts[pts.length - 1].iso)}</span>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        <Legend color="var(--income)" label="Healthy" />
        <Legend color="#e0a12b" label="Below floor" />
        <Legend color="var(--expense)" label="Overdrawn / bill day" />
        <Legend color="var(--text-primary)" label="Lowest point" outline />
      </div>
    </div>
  )
}
function Legend({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: outline ? 'transparent' : color, outline: outline ? `1.5px solid ${color}` : 'none' }} />{label}
    </span>
  )
}

const iconBtn: React.CSSProperties = { display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }
const fmtDay = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) }
// the next calendar date the monthly deposit lands on, e.g. "July 28"
const depositDateLabel = (day: number) => nextDateForDay(new Date(), day).toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })

// ── Modals ──────────────────────────────────────────────────────────
function Shell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 17 }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'block', marginBottom: 12 }}><span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, display: 'block', marginBottom: 5 }}>{label}</span>{children}</label>
}

function BalanceModal({ settings, onClose, onSaved }: { settings: Settings; onClose: () => void; onSaved: () => void }) {
  const [bal, setBal] = useState(String(settings.current_balance || ''))
  const [asOf, setAsOf] = useState(settings.balance_as_of || todayISO())
  const [depDay, setDepDay] = useState(String(settings.deposit_day))
  const [depAmt, setDepAmt] = useState(String(settings.deposit_amount || ''))
  const [buffer, setBuffer] = useState(String(settings.buffer || ''))
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/bills', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      current_balance: num(bal), balance_as_of: asOf, deposit_day: parseInt(depDay) || 28,
      deposit_amount: num(depAmt), buffer: num(buffer),
    }) })
    setSaving(false)
    if (res.ok) onSaved(); else alert('Could not save.')
  }
  return (
    <Shell title="Update balance & deposit" onClose={onClose}>
      <Field label="Current balance in the account"><input style={inp} inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} placeholder="0.00" autoFocus /></Field>
      <Field label="As of date"><input style={inp} type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Deposit day"><input style={inp} inputMode="numeric" value={depDay} onChange={(e) => setDepDay(e.target.value)} placeholder="28" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Deposit amount"><input style={inp} inputMode="decimal" value={depAmt} onChange={(e) => setDepAmt(e.target.value)} placeholder="0.00" /></Field></div>
      </div>
      <Field label="Safety buffer (optional — keep this much extra)"><input style={inp} inputMode="decimal" value={buffer} onChange={(e) => setBuffer(e.target.value)} placeholder="0.00" /></Field>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button className="chip" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Shell>
  )
}

function BillModal({ bill, onClose, onSaved }: { bill: Bill | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(bill?.name || '')
  const [day, setDay] = useState(String(bill?.day || ''))
  const [amount, setAmount] = useState(bill ? String(bill.amount) : '')
  const [quarterly, setQuarterly] = useState(!!bill?.quarterly)
  const [nextDue, setNextDue] = useState(bill?.next_due || '')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!name.trim() || !day || !amount) { alert('Name, day and amount are required.'); return }
    setSaving(true)
    const body = { id: bill?.id, name: name.trim(), day: parseInt(day), amount: num(amount), quarterly, next_due: quarterly ? (nextDue || null) : null }
    const res = await fetch('/api/bills', { method: bill ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (res.ok) onSaved(); else alert('Could not save.')
  }
  const del = async () => {
    if (!bill || !confirm('Delete this bill?')) return
    const res = await fetch(`/api/bills?id=${bill.id}`, { method: 'DELETE' })
    if (res.ok) onSaved(); else alert('Could not delete.')
  }
  return (
    <Shell title={bill ? 'Edit bill' : 'Add bill'} onClose={onClose}>
      <Field label="Bill name"><input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Manitoba Hydro" autoFocus /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Day of month"><input style={inp} inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} placeholder="15" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Amount"><input style={inp} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field></div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={quarterly} onChange={(e) => setQuarterly(e.target.checked)} /> Quarterly (not every month)
      </label>
      {quarterly && <Field label="Next due date"><input style={inp} type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} /></Field>}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        {bill && <button className="chip" onClick={del} style={{ color: 'var(--expense)' }} aria-label="Delete"><Trash2 size={15} /></button>}
        <button className="chip" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Shell>
  )
}

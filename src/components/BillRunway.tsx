'use client'

import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import { Pencil, Plus, Trash2, TriangleAlert, CheckCircle2, CalendarClock } from 'lucide-react'
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

// ── Coverage engine ─────────────────────────────────────────────────
// Walks the upcoming bills in date order from the current balance and answers
// "what does this balance cover, and when does it run out before payday?"
interface TLEvent { iso: string; name: string; amount: number; kind: 'bill' | 'deposit'; balanceAfter: number }
interface Projection {
  timeline: TLEvent[]         // bills (+ the payday deposit) from today to the next deposit
  startBalance: number
  buffer: number
  nextDepositISO: string | null
  troughBal: number           // lowest balance reached before the next deposit
  troughISO: string
  short: number               // >0 means you dip below the buffer by this much
  firstShort: TLEvent | null  // the first bill that breaches the buffer (0 covers it)
  coveredCount: number        // how many bills the balance covers before running short
}

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const stripTime = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const sameYMD = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function nextDateForDay(from: Date, day: number): Date {
  const inThis = new Date(from.getFullYear(), from.getMonth(), Math.min(day, daysInMonth(from.getFullYear(), from.getMonth())))
  if (inThis >= stripTime(from)) return inThis
  const y = from.getFullYear(), m = from.getMonth() + 1
  return new Date(y, m, Math.min(day, daysInMonth(y, m)))
}

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
  const DAYS = 60
  const to = addDays(from, DAYS)
  const qHits = new Map<string, Date[]>()
  bills.forEach((b) => { if (b.quarterly) qHits.set(b.id, quarterlyHits(b, from, to)) })

  const buffer = Number(s.buffer) || 0
  let bal = Number(s.current_balance) || 0
  const startBalance = bal
  const timeline: TLEvent[] = []
  let nextDepositISO: string | null = null
  let troughBal = bal
  let troughISO = from.toISOString().slice(0, 10)
  let depositReached = false

  for (let i = 0; i <= DAYS && !depositReached; i++) {
    const d = addDays(from, i)
    const dom = d.getDate()
    const iso = d.toISOString().slice(0, 10)
    // bills that hit today (money leaves before any same-day deposit — worst case)
    const dayBills = bills.filter((b) => b.quarterly ? (qHits.get(b.id) || []).some((h) => sameYMD(h, d)) : dom === b.day)
    for (const b of dayBills) {
      bal = Math.round((bal - Number(b.amount)) * 100) / 100
      if (bal < troughBal) { troughBal = bal; troughISO = iso }
      timeline.push({ iso, name: b.name, amount: Number(b.amount), kind: 'bill', balanceAfter: bal })
    }
    // then the monthly paycheque deposit (skip day 0 so today keeps the entered balance)
    if (i > 0 && dom === s.deposit_day && Number(s.deposit_amount) > 0) {
      bal = Math.round((bal + Number(s.deposit_amount)) * 100) / 100
      timeline.push({ iso, name: 'Paycheque deposit', amount: Number(s.deposit_amount), kind: 'deposit', balanceAfter: bal })
      nextDepositISO = iso
      depositReached = true
    }
  }

  const billEvents = timeline.filter((e) => e.kind === 'bill')
  const firstShort = billEvents.find((e) => e.balanceAfter < buffer) || null
  const coveredCount = firstShort ? billEvents.indexOf(firstShort) : billEvents.length
  const short = Math.max(0, buffer - troughBal)
  return { timeline, startBalance, buffer, nextDepositISO, troughBal, troughISO, short, firstShort, coveredCount }
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
  const staleDays = Math.max(0, Math.round((Date.parse(todayISO()) - Date.parse(asOf)) / 86400000))
  const stale = staleDays >= 1
  const dep = proj?.nextDepositISO

  return (
    <div style={{ marginBottom: 64 }}>
      {/* VERDICT — coverage framing */}
      {proj && (
      <div className="card glass" style={{ borderLeft: `4px solid ${covered ? 'var(--income)' : 'var(--expense)'}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {covered ? <CheckCircle2 size={26} color="var(--income)" style={{ flexShrink: 0, marginTop: 2 }} />
            : <TriangleAlert size={26} color="var(--expense)" style={{ flexShrink: 0, marginTop: 2 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 'clamp(18px, 4.5vw, 22px)', letterSpacing: '-0.01em' }}>
              {covered ? (dep ? 'Covered until payday' : 'Covered') : `Runs short ${money2(proj.short)}`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
              {covered
                ? <>Your <b style={{ color: 'var(--text-primary)' }}>{money2(proj.startBalance)}</b> covers {proj.coveredCount} bill{proj.coveredCount === 1 ? '' : 's'}{dep ? <> through your <b style={{ color: 'var(--text-primary)' }}>{fmtDay(dep)}</b> deposit</> : ''} — low of {money2(proj.troughBal)} on {fmtDay(proj.troughISO)}.</>
                : proj.firstShort
                  ? <><b style={{ color: 'var(--text-primary)' }}>{proj.firstShort.name}</b> ({money2(proj.firstShort.amount)}) on <b style={{ color: 'var(--text-primary)' }}>{fmtDay(proj.firstShort.iso)}</b> would leave you at <b style={{ color: 'var(--expense)' }}>{money2(proj.firstShort.balanceAfter)}</b>. Top up {money2(proj.short)} before then.</>
                  : <>Balance falls to <b style={{ color: 'var(--expense)' }}>{money2(proj.troughBal)}</b> — top up {money2(proj.short)}.</>}
              {stale && <> · <span style={{ color: 'var(--accent)' }}>based on your {fmtDay(asOf)} balance</span></>}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* BALANCE — with stale nudge */}
      <div className="card glass" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Home &amp; Utilities · as of {fmtDay(asOf)}</div>
            <div style={{ fontWeight: 700, fontSize: 28, letterSpacing: '-0.03em', marginTop: 4 }}>{money2(settings.current_balance)}</div>
          </div>
          <button className={`chip btn-accent ${stale ? 'btn-attention' : ''}`} onClick={() => setEditBalance(true)}>Update balance</button>
        </div>
        {stale && (
          <div style={{ marginTop: 12, padding: '9px 12px', background: 'var(--accent-soft)', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'center', color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>
            <TriangleAlert size={15} style={{ flexShrink: 0 }} /> Last updated {fmtDay(asOf)} · {staleDays} day{staleDays === 1 ? '' : 's'} ago — update your balance so the forecast stays accurate.
          </div>
        )}
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <MiniStat label="Monthly bills" value={money(monthlyTotal)} />
          <MiniStat label="Keep at least" value={money(monthlyTotal + settings.buffer)} accent />
          <MiniStat label="Next deposit" value={settings.deposit_amount ? `${money(settings.deposit_amount)} · ${depositDateLabel(settings.deposit_day)}` : depositDateLabel(settings.deposit_day)} />
        </div>
      </div>

      {/* COVERAGE TIMELINE — replaces the bar meter + old ledger */}
      {proj && <CoverageTimeline proj={proj} asOf={asOf} />}

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
// Chronological "what does my balance cover?" list — each bill drains the running
// balance; a cutoff line marks where it can no longer cover; the deposit refills it.
function CoverageTimeline({ proj, asOf }: { proj: Projection; asOf: string }) {
  const buffer = proj.buffer
  return (
    <div className="card glass">
      <h3 style={{ margin: '0 0 4px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}><CalendarClock size={16} /> Coverage timeline</h3>
      <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 14 }}>
        What your {money2(proj.startBalance)} covers before {proj.nextDepositISO ? `your ${fmtDay(proj.nextDepositISO)} deposit` : 'the next deposit'}
      </p>

      {/* starting balance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />
          <div style={{ fontWeight: 600 }}>Now <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {fmtDay(asOf)}</span></div>
        </div>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{money2(proj.startBalance)}</span>
      </div>

      {proj.timeline.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Nothing due before your next deposit — you&apos;re clear.</div>
      ) : proj.timeline.map((e, i) => {
        const isCutoff = proj.firstShort != null && e === proj.firstShort
        const below = e.kind === 'bill' && e.balanceAfter < buffer
        const dep = e.kind === 'deposit'
        return (
          <Fragment key={i}>
            {isCutoff && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0', color: 'var(--expense)' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--expense)', opacity: 0.4 }} />
                <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>⚠ balance runs out here</span>
                <div style={{ flex: 1, height: 1, background: 'var(--expense)', opacity: 0.4 }} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 4px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dep ? 'var(--income)' : below ? 'var(--expense)' : 'var(--text-muted)' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                  <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>{fmtDay(e.iso)}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: dep ? 'var(--income)' : 'var(--text-primary)' }}>{dep ? '+' : '−'}{money2(e.amount)}</div>
                <div style={{ fontSize: 12, marginTop: 2, color: e.balanceAfter < buffer ? 'var(--expense)' : 'var(--text-muted)' }}>→ {money2(e.balanceAfter)}</div>
              </div>
            </div>
          </Fragment>
        )
      })}

      {/* all-clear footer when nothing breaches before payday */}
      {proj.firstShort == null && proj.timeline.some((e) => e.kind === 'bill') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, color: 'var(--income)', fontSize: 12, fontWeight: 600 }}>
          <CheckCircle2 size={14} /> Every bill covered through payday.
        </div>
      )}
    </div>
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
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
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
        {bill && <button className="btn btn-secondary" onClick={del} style={{ color: 'var(--expense)', borderColor: 'var(--expense)' }} aria-label="Delete"><Trash2 size={15} /></button>}
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Shell>
  )
}

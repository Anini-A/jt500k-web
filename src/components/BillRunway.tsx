'use client'

import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import { Pencil, Plus, Trash2, TriangleAlert, CheckCircle2, CalendarClock } from 'lucide-react'
import { getJSON } from '@/lib/fresh'
import { ymd, today } from '@/lib/date'

interface Bill { id: string; account_id: string | null; name: string; day: number; amount: number; quarterly?: boolean; next_due?: string | null }
interface Account { id: string; name: string; current_balance: number; balance_as_of: string | null; buffer: number }

const num = (v: string) => parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0 // tolerates "$55.66", "1,234"
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const money2 = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
const todayISO = today // local date, not UTC
const AMBER = '#b7791f'
const AMBER_SOFT = 'rgba(224, 161, 43, 0.16)'
const inp: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 16, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

// ── Coverage engine ─────────────────────────────────────────────────
// Drains the current balance by each bill's NEXT occurrence (in date order) and
// answers "what does this balance cover, up to when, and what still needs a top-up?"
interface TLEvent { iso: string; name: string; amount: number; balanceAfter: number; covered: boolean }
interface Projection {
  timeline: TLEvent[]           // next occurrence of each upcoming bill, date-ordered
  startBalance: number
  buffer: number
  coveredCount: number          // bills fully covered while staying above the buffer
  coveredThroughISO: string | null  // date of the last covered bill
  firstShort: TLEvent | null    // first bill the balance can't cover
  remainingCount: number
  remainingTotal: number        // sum of the bills that still need funding
  short: number                 // top-up needed to cover everything upcoming
}

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const stripTime = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

function nextDateForDay(from: Date, day: number): Date {
  const inThis = new Date(from.getFullYear(), from.getMonth(), Math.min(day, daysInMonth(from.getFullYear(), from.getMonth())))
  if (inThis >= stripTime(from)) return inThis
  const y = from.getFullYear(), m = from.getMonth() + 1
  return new Date(y, m, Math.min(day, daysInMonth(y, m)))
}

// the next date a bill lands on or after `from` (monthly by day, or quarterly from next_due)
function nextOccurrence(bill: Bill, from: Date): Date | null {
  if (bill.quarterly) {
    if (!bill.next_due) return null
    const occ = stripTime(new Date(bill.next_due + 'T00:00:00'))
    for (let k = 0; k < 40; k++) {
      const d = new Date(occ.getFullYear(), occ.getMonth() + k * 3, occ.getDate())
      if (d >= from) return d
    }
    return null
  }
  return nextDateForDay(from, bill.day)
}

function project(bills: Bill[], s: { current_balance: number; balance_as_of: string | null; buffer: number }): Projection {
  const start = stripTime(new Date((s.balance_as_of || todayISO()) + 'T00:00:00'))
  const today = stripTime(new Date(todayISO() + 'T00:00:00'))
  const from = start < today ? today : start // never project into the past
  const buffer = Number(s.buffer) || 0

  const upcoming = bills
    .map((b) => ({ b, date: nextOccurrence(b, from) }))
    .filter((x): x is { b: Bill; date: Date } => x.date != null)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  let bal = Number(s.current_balance) || 0
  const startBalance = bal
  const timeline: TLEvent[] = []
  let coveredCount = 0
  let coveredThroughISO: string | null = null
  let firstShort: TLEvent | null = null
  let remainingTotal = 0

  for (const { b, date } of upcoming) {
    bal = Math.round((bal - Number(b.amount)) * 100) / 100
    const covered = bal >= buffer // balance only decreases, so once below it stays below
    const ev: TLEvent = { iso: ymd(date), name: b.name, amount: Number(b.amount), balanceAfter: bal, covered }
    if (covered) { coveredCount++; coveredThroughISO = ev.iso }
    else { remainingTotal += ev.amount; if (!firstShort) firstShort = ev }
    timeline.push(ev)
  }

  const short = Math.max(0, buffer - bal) // top-up to cover every upcoming bill
  return { timeline, startBalance, buffer, coveredCount, coveredThroughISO, firstShort, remainingCount: timeline.length - coveredCount, remainingTotal, short }
}

// ── UI ──────────────────────────────────────────────────────────────
export default function BillRunway() {
  const [bills, setBills] = useState<Bill[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [editBalance, setEditBalance] = useState(false) // edits the active account
  const [newAccount, setNewAccount] = useState(false)
  const [editBill, setEditBill] = useState<Bill | 'new' | null>(null)

  const load = useCallback(async () => {
    const d = await getJSON('/api/bills').catch(() => null)
    if (d && !d.error) {
      setBills((d.bills || []).map((b: Bill) => ({ ...b, amount: Number(b.amount) })))
      const accs: Account[] = (d.accounts || []).map((a: any) => ({
        id: a.id, name: a.name, current_balance: Number(a.current_balance) || 0,
        balance_as_of: a.balance_as_of || null, buffer: Number(a.buffer) || 0,
      }))
      setAccounts(accs)
      setActiveId((cur) => (cur && accs.some((a) => a.id === cur)) ? cur : (accs[0]?.id || ''))
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const active = accounts.find((a) => a.id === activeId) || null
  const acctBills = useMemo(() => bills.filter((b) => b.account_id === activeId), [bills, activeId])
  const proj = useMemo(() => (active ? project(acctBills, active) : null), [acctBills, active])
  // per-account coverage (for the pill status dots)
  const coverageOf = useCallback((a: Account) => project(bills.filter((b) => b.account_id === a.id), a).firstShort == null, [bills])

  if (loading) return <div className="card glass" style={{ padding: 40, textAlign: 'center' }}>Loading your bill runway…</div>
  if (!accounts.length) return (
    <div className="card glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      No bill accounts yet. Run <code>sql/bill_accounts_setup.sql</code> in Supabase to get started.
    </div>
  )
  if (!active) return null

  const monthlyTotal = acctBills.filter((b) => !b.quarterly).reduce((s, b) => s + b.amount, 0)
  const covered = proj ? proj.firstShort == null : true
  const asOf = active.balance_as_of || todayISO()
  const staleDays = Math.max(0, Math.round((Date.parse(todayISO()) - Date.parse(asOf)) / 86400000))
  const stale = staleDays >= 1
  const through = proj?.coveredThroughISO
  const settings = active // alias so the balance card / modal read the active account

  return (
    <div style={{ marginBottom: 64 }}>
      {/* ACCOUNT SWITCHER */}
      <section className="block" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div className="tabs">
          {accounts.map((a) => {
            const ok = coverageOf(a)
            return (
              <button key={a.id} onClick={() => setActiveId(a.id)} className={`tab ${a.id === activeId ? 'tab-active' : ''}`}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? 'var(--income)' : AMBER, flexShrink: 0 }} />
                {a.name}
              </button>
            )
          })}
          <button onClick={() => setNewAccount(true)} className="tab" title="Add account"><Plus size={15} /></button>
        </div>
      </section>

      {/* VERDICT + BALANCE — side by side */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
      {proj && (
      <div className="card glass" style={{ borderLeft: `4px solid ${covered ? 'var(--income)' : AMBER}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: proj.timeline.length ? 12 : 0 }}>
          {covered ? <CheckCircle2 size={24} color="var(--income)" style={{ flexShrink: 0 }} />
            : <TriangleAlert size={24} color={AMBER} style={{ flexShrink: 0 }} />}
          <div style={{ fontWeight: 700, fontSize: 'clamp(19px, 4.5vw, 24px)', letterSpacing: '-0.015em', minWidth: 0 }}>
            {proj.timeline.length === 0 ? 'No upcoming bills'
              : covered ? 'You’re covered'
              : proj.coveredCount > 0 ? <>Covered through {fmtDay(through!)}</>
              : 'Top up needed'}
          </div>
        </div>

        {proj.timeline.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing scheduled — add bills below.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {/* covers line */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--income-soft)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Covers {proj.coveredCount} bill{proj.coveredCount === 1 ? '' : 's'}{through ? ` to ${fmtDay(through)}` : ''}</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--income)' }}>{money2(proj.startBalance)}</span>
            </div>
            {/* needs top-up line */}
            {proj.firstShort ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '9px 12px', borderRadius: 10, background: AMBER_SOFT }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 0 }}>Top up for <b style={{ color: 'var(--text-primary)' }}>{proj.firstShort.name}</b>{proj.remainingCount > 1 ? ` +${proj.remainingCount - 1} more` : ''} · {fmtDay(proj.firstShort.iso)}</span>
                <span style={{ fontWeight: 700, fontSize: 15, color: AMBER, whiteSpace: 'nowrap' }}>{money2(proj.remainingTotal)}</span>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--income)', fontWeight: 600, padding: '2px 2px' }}>Every upcoming bill covered.</div>
            )}
            {stale && <div style={{ fontSize: 12, color: AMBER }}>Based on your {fmtDay(asOf)} balance.</div>}
          </div>
        )}
      </div>
      )}

        {/* BALANCE — with stale nudge */}
        <div className="card glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {active.name} · as of {fmtDay(asOf)}
                <button onClick={() => setEditBalance(true)} aria-label="Account settings" title="Rename / delete account" style={{ ...iconBtn, padding: 3 }}><Pencil size={12} /></button>
              </div>
              <div style={{ fontWeight: 700, fontSize: 28, letterSpacing: '-0.03em', marginTop: 4 }}>{money2(settings.current_balance)}</div>
            </div>
            {!stale && <button className="chip btn-accent" onClick={() => setEditBalance(true)}>Update balance</button>}
          </div>
          {stale && (
            <div style={{ marginTop: 12, padding: '12px 14px', background: AMBER_SOFT, borderRadius: 12, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: AMBER, fontSize: 13, fontWeight: 600, minWidth: 0, flex: 1 }}>
                <TriangleAlert size={15} style={{ flexShrink: 0 }} /> Last updated {fmtDay(asOf)} · {staleDays} day{staleDays === 1 ? '' : 's'} ago — update your balance so the forecast stays accurate.
              </div>
              <button className="btn-warn" style={{ flexShrink: 0, padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: 'transparent', border: `1px solid ${AMBER}`, cursor: 'pointer' }} onClick={() => setEditBalance(true)}>Update balance</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <MiniStat label="Monthly bills" value={money(monthlyTotal)} />
            <MiniStat label="Safety buffer" value={money(settings.buffer)} accent />
          </div>
        </div>
      </div>

      {/* COVERAGE TIMELINE — full-width long card */}
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
          {[...acctBills].sort((a, b) => a.day - b.day).map((b, i) => (
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

      {editBalance && <AccountModal account={active} canDelete={accounts.length > 1} onClose={() => setEditBalance(false)} onSaved={(id) => { setEditBalance(false); if (id !== undefined) setActiveId(id); load() }} />}
      {newAccount && <AccountModal account={null} canDelete={false} onClose={() => setNewAccount(false)} onSaved={(id) => { setNewAccount(false); if (id) setActiveId(id); load() }} />}
      {editBill && <BillModal bill={editBill === 'new' ? null : editBill} accountId={activeId} onClose={() => setEditBill(null)} onSaved={() => { setEditBill(null); load() }} />}
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

// Horizontal "runway" — bills laid out left→right in date order as scrollable tiles.
// Green tiles are covered by the balance; an amber marker shows where it runs out.
function CoverageTimeline({ proj, asOf }: { proj: Projection; asOf: string }) {
  return (
    <div className="card glass">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}><CalendarClock size={16} /> Coverage timeline</h3>
        <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {proj.coveredThroughISO ? <>covers up to <b style={{ color: 'var(--text-primary)' }}>{fmtDay(proj.coveredThroughISO)}</b></> : 'what your balance covers'}
          {proj.firstShort ? <> · <span style={{ color: AMBER, fontWeight: 600 }}>{proj.remainingCount} to top up · {money2(proj.remainingTotal)}</span></> : proj.timeline.length ? <> · <span style={{ color: 'var(--income)', fontWeight: 600 }}>all covered</span></> : null}
        </span>
      </div>

      {proj.timeline.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>No upcoming bills.</div>
      ) : (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x proximity' }}>
          {/* start tile */}
          <div style={{ flex: '0 0 auto', width: 116, scrollSnapAlign: 'start', borderRadius: 12, padding: '11px 12px', background: 'var(--kpi-bg)', borderTop: '3px solid var(--text-muted)' }}>
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>Now · {fmtDay(asOf)}</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginTop: 6, color: 'var(--text-secondary)' }}>Balance</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{money2(proj.startBalance)}</div>
          </div>

          {proj.timeline.map((e, i) => {
            const isCutoff = proj.firstShort != null && e === proj.firstShort
            const tone = e.covered ? 'var(--income)' : AMBER
            return (
              <Fragment key={i}>
                {isCutoff && (
                  <div style={{ flex: '0 0 auto', width: 34, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: AMBER }} title="Balance runs out — top up">
                    <TriangleAlert size={15} />
                    <div style={{ width: 2, flex: 1, minHeight: 40, background: AMBER, opacity: 0.5, borderRadius: 2 }} />
                  </div>
                )}
                <div style={{ flex: '0 0 auto', width: 132, scrollSnapAlign: 'start', borderRadius: 12, padding: '11px 12px', background: e.covered ? 'var(--kpi-bg)' : AMBER_SOFT, borderTop: `3px solid ${tone}` }}>
                  <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{fmtDay(e.iso)}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.name}>{e.name}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>−{money2(e.amount)}</div>
                  <div style={{ fontSize: 12, marginTop: 3, color: e.covered ? 'var(--text-muted)' : AMBER }}>→ {money2(e.balanceAfter)}</div>
                </div>
              </Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = { display: 'inline-flex', padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }
const fmtDay = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) }

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

// Create a new account OR edit the active one's name/balance/buffer (+ delete).
// onSaved(id): id = new account id on create, '' after delete, undefined after edit.
function AccountModal({ account, canDelete, onClose, onSaved }: { account: Account | null; canDelete: boolean; onClose: () => void; onSaved: (id?: string) => void }) {
  const isNew = account == null
  const [name, setName] = useState(account?.name || '')
  const [bal, setBal] = useState(account ? String(account.current_balance || '') : '')
  const [asOf, setAsOf] = useState(account?.balance_as_of || todayISO())
  const [buffer, setBuffer] = useState(account ? String(account.buffer || '') : '')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!name.trim()) { alert('Account name is required.'); return }
    setSaving(true)
    const body: Record<string, unknown> = { name: name.trim(), current_balance: num(bal), balance_as_of: asOf, buffer: num(buffer) }
    const res = isNew
      ? await fetch('/api/bill-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/bill-accounts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: account!.id, ...body }) })
    setSaving(false)
    if (!res.ok) { alert('Could not save.'); return }
    const j = await res.json().catch(() => ({}))
    onSaved(isNew ? j.id : undefined)
  }
  const del = async () => {
    if (!account || !confirm(`Delete the "${account.name}" account and all its bills?`)) return
    const res = await fetch(`/api/bill-accounts?id=${account.id}`, { method: 'DELETE' })
    if (res.ok) onSaved(''); else alert('Could not delete.')
  }
  return (
    <Shell title={isNew ? 'Add account' : `${account!.name}`} onClose={onClose}>
      <Field label="Account name"><input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Transpo" autoFocus={isNew} /></Field>
      <Field label="Current balance"><input style={inp} inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} placeholder="0.00" autoFocus={!isNew} /></Field>
      <Field label="As of date"><input style={inp} type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
      <Field label="Safety buffer (keep at least this much)"><input style={inp} inputMode="decimal" value={buffer} onChange={(e) => setBuffer(e.target.value)} placeholder="0.00" /></Field>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        {!isNew && canDelete && <button className="btn btn-secondary" style={{ color: 'var(--expense)', borderColor: 'var(--expense)' }} onClick={del} aria-label="Delete account"><Trash2 size={15} /></button>}
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Shell>
  )
}

function BillModal({ bill, accountId, onClose, onSaved }: { bill: Bill | null; accountId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(bill?.name || '')
  const [day, setDay] = useState(String(bill?.day || ''))
  const [amount, setAmount] = useState(bill ? String(bill.amount) : '')
  const [quarterly, setQuarterly] = useState(!!bill?.quarterly)
  const [nextDue, setNextDue] = useState(bill?.next_due || '')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!name.trim() || !day || !amount) { alert('Name, day and amount are required.'); return }
    setSaving(true)
    const body = { id: bill?.id, account_id: accountId, name: name.trim(), day: parseInt(day), amount: num(amount), quarterly, next_due: quarterly ? (nextDue || null) : null }
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

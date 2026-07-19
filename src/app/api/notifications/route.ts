import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { shortfall } from '@/lib/billRunway'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const norm = (s: string | null) => (s || '').trim().toLowerCase()
const money = (n: number) => '$' + Math.round(n).toLocaleString()

async function household() {
  const { data } = await supabaseAdmin.from('households').select('id').order('created_at').limit(1).maybeSingle()
  return data?.id as string | undefined
}

// kind: 'action' = persists until the underlying condition clears; not dismissible
//       (except recurring, which allows a "skip this month" via dismissible:true).
//       'info' = purely informational; always dismissible.
interface Notif { id: string; icon: string; title: string; detail: string; severity: 'info' | 'warn'; kind: 'action' | 'info'; dismissible: boolean }

// GET /api/notifications — recurring reminders, category trends, over-budget alerts.
export async function GET() {
  const [{ data: txAll }, { data: recs }, { data: budgetLines }, { data: cats }, { data: prof }, billsRes, billSetRes, dismRes] = await Promise.all([
    supabaseAdmin.from('transactions').select('type, amount, date, category, description'),
    supabaseAdmin.from('recurring').select('name, type, category, amount, description, active'),
    supabaseAdmin.from('budgets').select('category, amount'),
    supabaseAdmin.from('categories').select('name, type'),
    supabaseAdmin.from('household_profile').select('data').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('bills').select('name, day, amount, quarterly, next_due, active').then((r) => r, () => ({ data: null })),
    supabaseAdmin.from('bill_settings').select('*').limit(1).maybeSingle().then((r) => r, () => ({ data: null })),
    supabaseAdmin.from('dismissed_notifs').select('notif_id').then((r) => r, () => ({ data: null })),
  ])
  const txns = txAll ?? []
  const typeByCat = new Map((cats ?? []).map((c) => [c.name, c.type]))
  const out: Notif[] = []

  // latest month present in the data (the "current" tracking month)
  const curMonth = txns.reduce((mx, t) => ((t.date as string) > mx ? (t.date as string) : mx), '0000-00').slice(0, 7)

  // ---- 1) Over-budget alerts (this month) ----
  const spentThisMonth = new Map<string, number>()
  for (const t of txns) {
    if ((t.date as string).slice(0, 7) !== curMonth) continue
    if (t.type === 'expense' && t.category) spentThisMonth.set(t.category, (spentThisMonth.get(t.category) || 0) + Number(t.amount))
  }
  const budgetByCat = new Map<string, number>()
  for (const b of budgetLines ?? []) budgetByCat.set(b.category, (budgetByCat.get(b.category) || 0) + Number(b.amount))
  for (const [cat, budgeted] of budgetByCat) {
    if (cat === 'Debt Repayment' || typeByCat.get(cat) !== 'expense') continue
    const spent = spentThisMonth.get(cat) || 0
    if (budgeted > 0 && spent > budgeted) {
      out.push({ id: `overbudget-${cat}-${curMonth}`, icon: '⚠️', severity: 'warn', kind: 'action', dismissible: false, title: `Over budget: ${cat}`, detail: `Spent ${money(spent)} of ${money(budgeted)} — over by ${money(spent - budgeted)} this month.` })
    }
  }

  // ---- 2) Category spending trends (last complete month vs prior 3-month avg) ----
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const completeMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  const monthCat = new Map<string, Map<string, number>>() // month -> cat -> total
  for (const t of txns) {
    if (t.type !== 'expense' || !t.category) continue
    const m = (t.date as string).slice(0, 7)
    if (!monthCat.has(m)) monthCat.set(m, new Map())
    const mm = monthCat.get(m)!
    mm.set(t.category, (mm.get(t.category) || 0) + Number(t.amount))
  }
  const priorMonths: string[] = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(prev.getFullYear(), prev.getMonth() - i, 1)
    priorMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const curCats = monthCat.get(completeMonth)
  if (curCats) {
    for (const [cat, spent] of curCats) {
      const hist = priorMonths.map((m) => monthCat.get(m)?.get(cat) || 0)
      const seen = hist.filter((v) => v > 0)
      if (seen.length < 2) continue // not enough history
      const avg = seen.reduce((s, v) => s + v, 0) / seen.length
      if (avg > 0 && spent > avg * 1.25 && spent - avg > 75) {
        const pct = Math.round(((spent - avg) / avg) * 100)
        out.push({ id: `trend-${cat}-${completeMonth}`, icon: '📈', severity: 'info', kind: 'info', dismissible: true, title: `${cat} spending is climbing`, detail: `${money(spent)} last month — ${pct}% above its ${seen.length}-month average of ${money(avg)}.` })
      }
    }
  }

  // ---- 3) Recurring items not yet logged this month ----
  const active = (recs ?? []).filter((r) => r.active)
  if (active.length) {
    const curTx = txns.filter((t) => (t.date as string).slice(0, 7) === curMonth)
    const isLogged = (r: any) => curTx.some((t) =>
      t.type === r.type && t.category === r.category &&
      (norm(t.description) === norm(r.name) || norm(t.description) === norm(r.description) ||
        Math.abs(Number(t.amount) - Number(r.amount)) <= Math.max(1, Number(r.amount) * 0.05)))
    const missing = active.filter((r) => !isLogged(r))
    if (missing.length) {
      const names = missing.slice(0, 6).map((r) => r.name).join(', ')
      out.push({ id: `recurring-${curMonth}`, icon: '🔁', severity: 'info', kind: 'action', dismissible: true, title: `${missing.length} recurring item${missing.length !== 1 ? 's' : ''} to log this month`, detail: `${names}${missing.length > 6 ? '…' : ''}. Open ➕ Add → Recurring, or ask the assistant to log them.` })
    }
  }

  // ---- 4) Household to-dos (open estate/insurance items from the profile) ----
  const todoRe = /pending|none yet|not (yet|done|set up|submitted|completed)|to (do|submit|update|complete|sign)|missing|no will|no poa|⚠️/i
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  for (const sec of (prof?.data?.sections || [])) {
    if (!['estate', 'insurance'].includes(sec.id)) continue
    for (const it of (sec.items || [])) {
      if (/^https?:\/\//i.test(String(it.value || ''))) continue // skip links
      // explicit status wins; else fall back to text detection
      const open = it.status !== undefined ? it.status !== 'done' : todoRe.test(String(it.value || ''))
      if (open) {
        out.push({ id: `todo-${sec.id}-${slug(it.label)}`, icon: '📌', severity: 'info', kind: 'action', dismissible: false, title: `To-do: ${it.label}`, detail: it.value })
      }
    }
  }

  // ---- 5) Bill runway: will the Home & Utilities balance cover bills before the next deposit? ----
  const bills = (billsRes?.data || []).filter((b: any) => b.active !== false)
  const bset = billSetRes?.data
  if (bills.length && bset) {
    const res = shortfall(bills, bset)
    if (res && res.short > 0) {
      const buffer = Number(bset.buffer) || 0
      out.push({ id: `bill-runway`, icon: '⚠️', severity: 'warn', kind: 'action', dismissible: false, title: `Home & Utilities may run short`, detail: `Balance dips to ${money(res.trough.balance)} on ${res.trough.label}${buffer ? ` (below your ${money(buffer)} floor)` : ''} — top up about ${money(res.short)} before then.` })
    }
  }

  // drop anything the household has dismissed (only info items + recurring "skip" ever land here)
  const dismissed = new Set<string>((dismRes?.data || []).map((r: { notif_id: string }) => r.notif_id))
  const visible = out.filter((n) => !dismissed.has(n.id))

  // warnings first
  visible.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1))
  return NextResponse.json({ notifications: visible }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/notifications — dismiss one or more items { id } or { ids: [] }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const ids: string[] = body.ids || (body.id ? [body.id] : [])
  if (!ids.length) return NextResponse.json({ error: 'id or ids required' }, { status: 400 })
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household' }, { status: 400 })
  const rows = ids.map((notif_id) => ({ household_id: hh, notif_id }))
  const { error } = await supabaseAdmin.from('dismissed_notifs').upsert(rows, { onConflict: 'household_id,notif_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

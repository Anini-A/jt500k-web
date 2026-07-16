import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const norm = (s: string | null) => (s || '').trim().toLowerCase()
const money = (n: number) => '$' + Math.round(n).toLocaleString()

interface Notif { id: string; icon: string; title: string; detail: string; severity: 'info' | 'warn' }

// GET /api/notifications — recurring reminders, category trends, over-budget alerts.
export async function GET() {
  const [{ data: txAll }, { data: recs }, { data: budgetLines }, { data: cats }, { data: prof }] = await Promise.all([
    supabaseAdmin.from('transactions').select('type, amount, date, category, description'),
    supabaseAdmin.from('recurring').select('name, type, category, amount, description, active'),
    supabaseAdmin.from('budgets').select('category, amount'),
    supabaseAdmin.from('categories').select('name, type'),
    supabaseAdmin.from('household_profile').select('data').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
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
      out.push({ id: `overbudget-${cat}-${curMonth}`, icon: '⚠️', severity: 'warn', title: `Over budget: ${cat}`, detail: `Spent ${money(spent)} of ${money(budgeted)} — over by ${money(spent - budgeted)} this month.` })
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
        out.push({ id: `trend-${cat}-${completeMonth}`, icon: '📈', severity: 'info', title: `${cat} spending is climbing`, detail: `${money(spent)} last month — ${pct}% above its ${seen.length}-month average of ${money(avg)}.` })
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
      out.push({ id: `recurring-${curMonth}-${missing.length}`, icon: '🔁', severity: 'info', title: `${missing.length} recurring item${missing.length !== 1 ? 's' : ''} to log this month`, detail: `${names}${missing.length > 6 ? '…' : ''}. Open ➕ Add → Recurring, or ask the assistant to log them.` })
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
        out.push({ id: `todo-${sec.id}-${slug(it.label)}`, icon: '📌', severity: 'info', title: `To-do: ${it.label}`, detail: it.value })
      }
    }
  }

  // warnings first
  out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1))
  return NextResponse.json({ notifications: out }, { headers: { 'Cache-Control': 'no-store' } })
}

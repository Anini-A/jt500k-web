import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { projectCycle } from '@/lib/billRunway'
import { ymd } from '@/lib/date'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const norm = (s: string | null) => (s || '').trim().toLowerCase()
const fmtDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })

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
  const [{ data: txAll }, { data: budgetLines }, { data: cats }, { data: prof }, billsRes, billSetRes, dismRes, catBudgetRes, debtRes] = await Promise.all([
    supabaseAdmin.from('transactions').select('type, amount, date, category, description'),
    supabaseAdmin.from('budgets').select('name, category, amount, debt_name'),
    supabaseAdmin.from('categories').select('name, type'),
    supabaseAdmin.from('household_profile').select('data').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('bills').select('account_id, name, day, amount, quarterly, next_due, active').then((r) => r, () => ({ data: null })),
    supabaseAdmin.from('bill_accounts').select('*').then((r) => r, () => ({ data: null })),
    supabaseAdmin.from('dismissed_notifs').select('notif_id').then((r) => r, () => ({ data: null })),
    supabaseAdmin.from('category_budgets').select('category, amount').then((r) => r, () => ({ data: null })),
    supabaseAdmin.from('debts').select('name, amount').then((r) => r, () => ({ data: null })),
  ])
  const txns = txAll ?? []
  const typeByCat = new Map((cats ?? []).map((c) => [c.name, c.type]))
  const out: Notif[] = []

  // The CURRENT calendar month. Bills are often logged ahead of time, and taking the
  // furthest-dated row instead would hand the whole alert set to a future month the
  // moment one October payment is entered — going quiet about the month you're in.
  const curMonth = ymd(new Date()).slice(0, 7)

  // ---- 1) Over-budget alerts (this month) ----
  const spentThisMonth = new Map<string, number>()
  for (const t of txns) {
    if ((t.date as string).slice(0, 7) !== curMonth) continue
    if (t.type === 'expense' && t.category) spentThisMonth.set(t.category, (spentThisMonth.get(t.category) || 0) + Number(t.amount))
  }
  const budgetByCat = new Map<string, number>()
  for (const b of budgetLines ?? []) budgetByCat.set(b.category, (budgetByCat.get(b.category) || 0) + Number(b.amount))
  const lineTotalByCat = new Map(budgetByCat)
  for (const o of catBudgetRes?.data ?? []) budgetByCat.set(o.category as string, Number(o.amount))
  for (const [cat, budgeted] of budgetByCat) {
    if (cat === 'Debt Repayment' || typeByCat.get(cat) !== 'expense') continue
    const spent = spentThisMonth.get(cat) || 0
    if (budgeted > 0 && spent > budgeted) {
      out.push({ id: `overbudget-${cat}-${curMonth}`, icon: '📊', severity: 'info', kind: 'info', dismissible: true, title: `Over budget: ${cat}`, detail: `Spent ${money(spent)} of ${money(budgeted)} — over by ${money(spent - budgeted)} this month.` })
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
  // Built from the SAME source as the Recurring tab — bills first, then budget lines that
  // aren't already covered by a bill of the same name. The old `recurring` table is a
  // third list nothing else reads, and it had drifted: it still named a debt the plan no
  // longer pays and amounts that no longer match, so this nagged about items already
  // logged and stayed quiet about ones that weren't.
  const planRows = (() => {
    const rows = (billsRes?.data ?? []).filter((b: any) => b.active !== false)
      .map((b: any) => ({ name: b.name as string, category: (b.category as string) ?? null, amount: Number(b.amount), debt_name: null as string | null }))
    const seen = new Set(rows.map((r) => norm(r.name)))
    for (const b of budgetLines ?? []) {
      if (seen.has(norm(b.name as string))) continue
      seen.add(norm(b.name as string))
      rows.push({ name: b.name as string, category: b.category as string, amount: Number(b.amount), debt_name: (b.debt_name as string) ?? null })
    }
    return rows
  })()
  if (planRows.length) {
    const curTx = txns.filter((t) => (t.date as string).slice(0, 7) === curMonth)
    // A debt line counts as logged when its DEBT was paid this month — the payment is
    // described with the debt's name, never the plan line's.
    const isLogged = (r: { name: string; category: string | null; amount: number; debt_name: string | null }) => curTx.some((t) => {
      if (r.debt_name) return t.category === 'Debt Repayment' && norm(t.description) === norm(r.debt_name)
      if (r.category && t.category !== r.category) return false
      return norm(t.description) === norm(r.name) ||
        Math.abs(Number(t.amount) - r.amount) <= Math.max(1, r.amount * 0.05)
    })
    const missing = planRows.filter((r) => !isLogged(r))
    if (missing.length) {
      const names = missing.slice(0, 6).map((r) => r.name).join(', ')
      out.push({ id: `recurring-${curMonth}`, icon: '🔁', severity: 'info', kind: 'action', dismissible: true, title: `${missing.length} recurring item${missing.length !== 1 ? 's' : ''} to log this month`, detail: `${names}${missing.length > 6 ? '…' : ''}. Open ➕ Add → Recurring, or ask the assistant to log them.` })
    }
  }

  // ---- 3b) The plan doesn't fund itself ----
  // Budgeted income against every dollar given a job. Worth knowing before the month
  // runs, not after — and it's the one thing the Budget page can't nag you about,
  // because you have to be looking at it.
  {
    const budgetedIncome = [...budgetByCat].filter(([c]) => typeByCat.get(c) === 'income').reduce((n, [, v]) => n + v, 0)
    const allocated = [...budgetByCat].filter(([c]) => typeByCat.get(c) !== 'income').reduce((n, [, v]) => n + v, 0)
    if (budgetedIncome > 0 && allocated > budgetedIncome) {
      out.push({ id: `plan-overallocated-${curMonth}`, icon: '⚖️', severity: 'warn', kind: 'action', dismissible: false,
        title: 'Your budget doesn\u2019t balance',
        detail: `${money(allocated)} is allocated against ${money(budgetedIncome)} of budgeted income — over by ${money(allocated - budgetedIncome)}. Trim an envelope or raise the income you expect.` })
    }
  }

  // ---- 3c) Debt payments that landed against no debt ----
  // A payment counts toward a debt only when its description matches the debt's name, so
  // a typo or a renamed debt silently loses the money. Nothing else surfaces that.
  {
    const debtNames = new Set((debtRes?.data ?? []).map((d: any) => norm(d.name)))
    if (debtNames.size) {
      const orphans = txns.filter((t) => t.category === 'Debt Repayment' && (t.date as string).slice(0, 7) === curMonth && !debtNames.has(norm(t.description)))
      const total = orphans.reduce((n, t) => n + Number(t.amount), 0)
      if (orphans.length) {
        out.push({ id: `debt-unmatched-${curMonth}`, icon: '🔗', severity: 'warn', kind: 'action', dismissible: false,
          title: `${money(total)} of debt payments match no debt`,
          detail: `${orphans.length} payment${orphans.length !== 1 ? 's' : ''} this month (${orphans.slice(0, 3).map((t) => t.description || 'no description').join(', ')}) don\u2019t match a tracked debt, so no balance came down. Edit the description to the debt's exact name.` })
      }
    }
    // a repayment line pointing at no debt sends its money nowhere the tracker can see
    const unlinked = (budgetLines ?? []).filter((b) => b.category === 'Debt Repayment' && !b.debt_name)
    const unlinkedTotal = unlinked.reduce((n, b) => n + Number(b.amount), 0)
    if (unlinked.length && debtNames.size) {
      out.push({ id: `debt-unlinked-lines-${curMonth}`, icon: '🔗', severity: 'info', kind: 'info', dismissible: true,
        title: `${money(unlinkedTotal)}/mo of debt budget isn\u2019t pointed at a debt`,
        detail: `${unlinked.map((b) => b.name).join(', ')} — pick the debt in \u2795 Add \u2192 Recurring so payments count against a balance.` })
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

  // ---- 4b) Bi-monthly nudge: remind to upload holdings on each 2-month boundary ----
  // Periods are Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec (6/year). The
  // reminder shows when no upload has landed in the CURRENT period, and the id is
  // stamped with the period so dismissing silences it only until the next boundary.
  {
    const { data: holds } = await supabaseAdmin.from('holdings').select('as_of')
    if (holds && holds.length) {
      const latest = holds.reduce((mx, h) => (h.as_of && h.as_of > mx ? (h.as_of as string) : mx), '')
      if (latest) {
        const now2 = new Date()
        const period = Math.floor(now2.getMonth() / 2)              // 0..5
        const periodStart = new Date(now2.getFullYear(), period * 2, 1)
        const periodStartISO = ymd(periodStart)
        if (latest < periodStartISO) {                             // nothing uploaded this period yet
          out.push({
            id: `holdings-refresh-${now2.getFullYear()}P${period}`, icon: '📈', severity: 'info', kind: 'action', dismissible: true,
            title: 'Time to update your investments',
            detail: `Holdings were last updated ${latest}. Upload Jean's and Henriette's latest Wealthsimple CSVs to keep net worth accurate and record this period's point.`,
          })
        }
      }
    }
  }

  // ---- 5) Bill runway: will each account's balance cover its upcoming bills? ----
  const allBills = (billsRes?.data || []).filter((b: any) => b.active !== false)
  const billAccounts = (billSetRes?.data as any[]) || []
  for (const acc of billAccounts) {
    const accBills = allBills.filter((b: any) => b.account_id === acc.id)
    if (!accBills.length) continue
    const c = projectCycle(accBills, acc)
    if (c.short > 0 && c.firstShort) {
      // `short` is the cash needed to clear the cycle. The old figure was the gap at the
      // FIRST missed bill only, which read as "top up this and you're fine" when it covered
      // just one more bill.
      const through = c.coveredThroughISO ? fmtDay(c.coveredThroughISO) : null
      out.push({ id: `bill-runway-${acc.id}`, icon: '⚠️', severity: 'warn', kind: 'action', dismissible: false, title: `${acc.name} may run short`, detail: `${through ? `Covers bills to ${through}, then` : 'Short from'} ${fmtDay(c.firstShort.iso)} — ${money(c.short)} short of covering all ${c.timeline.length} bills due by ${fmtDay(c.horizonISO)}.` })
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

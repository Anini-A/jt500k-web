import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

async function household() {
  const { data } = await supabaseAdmin.from('households').select('id').order('created_at').limit(1).maybeSingle()
  return data?.id as string | undefined
}

// GET /api/budgets — line items rolled into per-category envelopes vs
// this month's actual spending in each category.
export async function GET(req: NextRequest) {
  const { data: lines, error } = await supabaseAdmin.from('budgets').select('*').order('amount', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // category types (for status semantics: expense over = bad, savings/debt over = good)
  const { data: cats } = await supabaseAdmin.from('categories').select('name, type')
  const typeByCat = new Map((cats ?? []).map((c) => [c.name, c.type]))

  const { data: allTx } = await supabaseAdmin.from('transactions').select('date, category, amount, description')
  const tx = allTx ?? []
  // tracking month = requested ?month=YYYY-MM, else the CURRENT calendar month
  // (not the latest month in data — future-dated entries must not hijack it)
  const current = new Date().toISOString().slice(0, 7)
  const monthParam = new URL(req.url).searchParams.get('month')
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : current
  const availableMonths = [...new Set([current, ...tx.map((t) => (t.date as string).slice(0, 7))])].sort().reverse()
  const spentByCat = new Map<string, number>()
  for (const t of tx) {
    if ((t.date as string).slice(0, 7) !== month) continue
    if (!t.category) continue
    spentByCat.set(t.category, (spentByCat.get(t.category) || 0) + Number(t.amount))
  }

  // group budget lines by category
  const envMap = new Map<string, { category: string; type: string; budgeted: number; items: any[] }>()
  for (const l of lines ?? []) {
    if (!envMap.has(l.category)) {
      envMap.set(l.category, { category: l.category, type: typeByCat.get(l.category) || 'expense', budgeted: 0, items: [] })
    }
    const e = envMap.get(l.category)!
    e.budgeted += Number(l.amount)
    e.items.push({ id: l.id, name: l.name, amount: Number(l.amount), debt_name: l.debt_name ?? null })
  }

  const envelopes = [...envMap.values()].map((e) => ({
    ...e,
    budgeted: Math.round(e.budgeted * 100) / 100,
    spent: Math.round((spentByCat.get(e.category) || 0) * 100) / 100,
  })).sort((a, b) => b.budgeted - a.budgeted)

  // ── Debt Repayment breakdown ────────────────────────────────────────────────
  // The envelope keeps ONE budgeted figure and one bar. These rows only attribute the
  // month's actual payments across the debts, so they always sum to what the envelope
  // already shows and can never inflate what's budgeted. Balances live on the Debts page.
  const { data: debtRows } = await supabaseAdmin.from('debts').select('name, amount')
  const norm = (v: string | null | undefined) => (v || '').trim().toLowerCase()
  const paidAllTime = new Map<string, number>()
  const paidThisMonth = new Map<string, number>()
  let debtSpentThisMonth = 0
  for (const t of tx) {
    if (t.category !== 'Debt Repayment') continue
    const k = norm(t.description as string)
    paidAllTime.set(k, (paidAllTime.get(k) || 0) + Number(t.amount))
    if ((t.date as string).slice(0, 7) === month) {
      paidThisMonth.set(k, (paidThisMonth.get(k) || 0) + Number(t.amount))
      debtSpentThisMonth += Number(t.amount)
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100
  const scored = (debtRows ?? []).map((d) => ({
    name: d.name as string,
    remaining: round(Number(d.amount) - (paidAllTime.get(norm(d.name as string)) || 0)),
    paid: round(paidThisMonth.get(norm(d.name as string)) || 0),
  }))
  // A settled debt drops off the list — it will never be paid again. Anything paid toward
  // a description that matches no debt is money that landed nowhere, so it is named.
  const active = scored.filter((d) => d.remaining > 0).sort((a, b) => b.remaining - a.remaining)
  const namedThisMonth = scored.reduce((s2, d) => s2 + d.paid, 0)
  const debtSummary = {
    rows: active.map(({ name, paid }) => ({ name, paid })),
    unassigned: round(debtSpentThisMonth - namedThisMonth),
    paidOff: scored.length - active.length,
    // planned money on Debt Repayment lines not yet pointed at a debt
    unlinkedPlanned: round((lines ?? [])
      .filter((l) => l.category === 'Debt Repayment' && !l.debt_name)
      .reduce((s2, l) => s2 + Number(l.amount), 0)),
  }

  const [y, mo] = month.split('-')
  const label = new Date(Number(y), Number(mo) - 1).toLocaleString('en', { month: 'long', year: 'numeric' })

  return NextResponse.json({
    month,
    label,
    availableMonths,
    envelopes,
    debtSummary,
    totalBudgeted: Math.round(envelopes.reduce((s, e) => s + e.budgeted, 0) * 100) / 100,
    totalSpent: Math.round(envelopes.reduce((s, e) => s + e.spent, 0) * 100) / 100,
  }, noStore)
}

// POST /api/budgets  { name, category, amount, debt_name? }
export async function POST(req: NextRequest) {
  const { name, category, amount, debt_name } = await req.json().catch(() => ({}))
  if (!name?.trim() || !category?.trim() || amount == null || isNaN(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: 'name, category and a positive amount are required' }, { status: 400 })
  }
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })
  const { error } = await supabaseAdmin.from('budgets')
    .insert({ household_id: hh, name: name.trim(), category, amount: Number(amount), debt_name: debt_name || null })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

// PATCH /api/budgets  { id, name?, category?, amount?, debt_name? }
export async function PATCH(req: NextRequest) {
  const { id, name, category, amount, debt_name } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (name?.trim()) patch.name = name.trim()
  if (category?.trim()) patch.category = category
  if (amount != null && !isNaN(Number(amount)) && Number(amount) > 0) patch.amount = Number(amount)
  // which debt this line pays down; '' clears the link
  if (debt_name !== undefined) patch.debt_name = debt_name || null
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const { error } = await supabaseAdmin.from('budgets').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/budgets?id=uuid
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('budgets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

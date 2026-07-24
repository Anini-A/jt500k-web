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

  const { data: allTx } = await supabaseAdmin.from('transactions').select('date, category, amount')
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
    e.items.push({ id: l.id, name: l.name, amount: Number(l.amount) })
  }

  const envelopes = [...envMap.values()].map((e) => ({
    ...e,
    budgeted: Math.round(e.budgeted * 100) / 100,
    spent: Math.round((spentByCat.get(e.category) || 0) * 100) / 100,
  })).sort((a, b) => b.budgeted - a.budgeted)

  const [y, mo] = month.split('-')
  const label = new Date(Number(y), Number(mo) - 1).toLocaleString('en', { month: 'long', year: 'numeric' })

  return NextResponse.json({
    month,
    label,
    availableMonths,
    envelopes,
    totalBudgeted: Math.round(envelopes.reduce((s, e) => s + e.budgeted, 0) * 100) / 100,
    totalSpent: Math.round(envelopes.reduce((s, e) => s + e.spent, 0) * 100) / 100,
  }, noStore)
}

// POST /api/budgets  { name, category, amount }
export async function POST(req: NextRequest) {
  const { name, category, amount } = await req.json().catch(() => ({}))
  if (!name?.trim() || !category?.trim() || amount == null || isNaN(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: 'name, category and a positive amount are required' }, { status: 400 })
  }
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })
  const { error } = await supabaseAdmin.from('budgets')
    .insert({ household_id: hh, name: name.trim(), category, amount: Number(amount) })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

// PATCH /api/budgets  { id, name?, category?, amount? }
export async function PATCH(req: NextRequest) {
  const { id, name, category, amount } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (name?.trim()) patch.name = name.trim()
  if (category?.trim()) patch.category = category
  if (amount != null && !isNaN(Number(amount)) && Number(amount) > 0) patch.amount = Number(amount)
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

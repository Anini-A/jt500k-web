import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } }
const norm = (s: string | null) => (s || '').trim().toLowerCase()

async function household() {
  const { data } = await supabaseAdmin.from('households').select('id').order('created_at').limit(1).maybeSingle()
  return data?.id as string | undefined
}

// GET /api/debts — debts with computed repayment progress.
// A payment counts toward a debt when its category is "Debt Repayment" and
// its description matches the debt name (case/whitespace-insensitive).
export async function GET() {
  const { data: debts, error } = await supabaseAdmin
    .from('debts').select('*').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: payments } = await supabaseAdmin
    .from('transactions')
    .select('description, amount, date')
    .eq('category', 'Debt Repayment')

  const byDesc = new Map<string, { paid: number; count: number; last: string }>()
  for (const p of payments ?? []) {
    const k = norm(p.description)
    const cur = byDesc.get(k) || { paid: 0, count: 0, last: '' }
    cur.paid += Number(p.amount) || 0
    cur.count += 1
    if ((p.date as string) > cur.last) cur.last = p.date as string
    byDesc.set(k, cur)
  }

  return NextResponse.json((debts ?? []).map((d) => {
    const m = byDesc.get(norm(d.name)) || { paid: 0, count: 0, last: '' }
    return {
      id: d.id,
      name: d.name,
      amount: Number(d.amount),
      paid: Math.round(m.paid * 100) / 100,
      remaining: Math.max(0, Math.round((Number(d.amount) - m.paid) * 100) / 100),
      payments: m.count,
      lastPayment: m.last || null,
    }
  }), noStore)
}

// POST /api/debts  { name, amount }
export async function POST(req: NextRequest) {
  const { name, amount } = await req.json().catch(() => ({}))
  if (!name?.trim() || amount == null || isNaN(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: 'name and a positive amount are required' }, { status: 400 })
  }
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })

  const { error } = await supabaseAdmin.from('debts')
    .insert({ household_id: hh, name: name.trim(), amount: Number(amount) })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

// PATCH /api/debts  { id, name?, amount? }
export async function PATCH(req: NextRequest) {
  const { id, name, amount } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (name?.trim()) patch.name = name.trim()
  if (amount != null && !isNaN(Number(amount)) && Number(amount) > 0) patch.amount = Number(amount)
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await supabaseAdmin.from('debts').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/debts?id=uuid
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('debts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

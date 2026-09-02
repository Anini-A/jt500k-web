import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// GET /api/transactions?limit=50&type=expense
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit')) || 100
  const type = searchParams.get('type')

  let query = supabaseAdmin
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit)

  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/transactions
//   single: { date, description, category, type, amount }
//   bulk:   [ {…}, {…} ]  → inserts many at once
export async function POST(req: NextRequest) {
  const body = await req.json()

  const { data: household } = await supabaseAdmin
    .from('households').select('id').limit(1).single()
  if (!household) {
    return NextResponse.json({ error: 'No household found. Run the import first.' }, { status: 400 })
  }

  // resolve category name → id + type
  const { data: cats } = await supabaseAdmin
    .from('categories').select('id, name, type').eq('household_id', household.id)
  const catByName = new Map((cats ?? []).map((c) => [c.name, c]))

  // ---- bulk ----
  if (Array.isArray(body)) {
    const rows = []
    for (const r of body) {
      if (!r.date || r.amount == null || isNaN(Number(r.amount))) {
        return NextResponse.json({ error: `Invalid row: ${JSON.stringify(r)}` }, { status: 400 })
      }
      const cat = r.category ? catByName.get(r.category) : undefined
      rows.push({
        household_id: household.id,
        category_id: cat?.id ?? null,
        date: r.date,
        description: (r.description ?? '').trim() || null,
        category: r.category ?? null,
        type: cat?.type ?? r.type ?? 'expense',
        amount: Number(r.amount),
      })
    }
    const { error } = await supabaseAdmin.from('transactions').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, inserted: rows.length }, { status: 201 })
  }

  // ---- single ----
  const { date, description, category, type, amount } = body
  if (!date || !type || amount == null) {
    return NextResponse.json({ error: 'date, type and amount are required' }, { status: 400 })
  }
  const cat = category ? catByName.get(category) : undefined

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .insert({
      household_id: household.id,
      category_id: cat?.id ?? null,
      date,
      description: description ?? null,
      category: category ?? null,
      type,
      amount,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/transactions  { id, date?, description?, amount?, category? }
// Edit any field of one transaction. Type follows the chosen category.
export async function PATCH(req: NextRequest) {
  const { id, date, description, amount, category } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (date) patch.date = date
  if (description !== undefined) patch.description = String(description).trim() || null
  if (amount != null && !isNaN(Number(amount)) && Number(amount) >= 0) patch.amount = Number(amount)
  if (category) {
    const { data: cat } = await supabaseAdmin
      .from('categories').select('id, name, type').eq('name', category).maybeSingle()
    if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    patch.category = cat.name
    patch.category_id = cat.id
    patch.type = cat.type
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('transactions').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/transactions?id=uuid
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('transactions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

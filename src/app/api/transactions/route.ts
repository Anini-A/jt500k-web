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

// POST /api/transactions  { date, description, category, type, amount }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, description, category, type, amount } = body

  if (!date || !type || amount == null) {
    return NextResponse.json(
      { error: 'date, type and amount are required' },
      { status: 400 },
    )
  }

  // Attach to the first household + matching category (single-household app)
  const { data: household } = await supabaseAdmin
    .from('households')
    .select('id')
    .limit(1)
    .single()

  if (!household) {
    return NextResponse.json(
      { error: 'No household found. Run the import first.' },
      { status: 400 },
    )
  }

  let categoryId: string | null = null
  if (category) {
    const { data: cat } = await supabaseAdmin
      .from('categories')
      .select('id')
      .eq('household_id', household.id)
      .eq('name', category)
      .maybeSingle()
    categoryId = cat?.id ?? null
  }

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .insert({
      household_id: household.id,
      category_id: categoryId,
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

// PATCH /api/transactions  { id, category }  — re-categorize one transaction
// (type follows the chosen category)
export async function PATCH(req: NextRequest) {
  const { id, category } = await req.json().catch(() => ({}))
  if (!id || !category) return NextResponse.json({ error: 'id and category required' }, { status: 400 })

  const { data: cat } = await supabaseAdmin
    .from('categories').select('id, name, type').eq('name', category).maybeSingle()
  if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('transactions')
    .update({ category: cat.name, category_id: cat.id, type: cat.type })
    .eq('id', id)
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

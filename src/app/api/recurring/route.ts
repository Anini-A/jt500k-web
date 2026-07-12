import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

async function household() {
  const { data } = await supabaseAdmin.from('households').select('id').order('created_at').limit(1).maybeSingle()
  return data?.id as string | undefined
}

// GET /api/recurring — all recurring templates
export async function GET() {
  const { data, error } = await supabaseAdmin.from('recurring').select('*').order('type').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/recurring  { name, type, category, amount, description? }
export async function POST(req: NextRequest) {
  const { name, type, category, amount, description } = await req.json().catch(() => ({}))
  if (!name?.trim() || !['income', 'expense', 'savings'].includes(type) || !category?.trim() || amount == null || isNaN(Number(amount))) {
    return NextResponse.json({ error: 'name, type, category and amount required' }, { status: 400 })
  }
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })
  const { error } = await supabaseAdmin.from('recurring')
    .insert({ household_id: hh, name: name.trim(), type, category, amount: Number(amount), description: description?.trim() || null })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

// PATCH /api/recurring  { id, ... }
export async function PATCH(req: NextRequest) {
  const { id, name, type, category, amount, description, active } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (name?.trim()) patch.name = name.trim()
  if (type) patch.type = type
  if (category?.trim()) patch.category = category
  if (amount != null && !isNaN(Number(amount))) patch.amount = Number(amount)
  if (description !== undefined) patch.description = description?.trim() || null
  if (active !== undefined) patch.active = !!active
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const { error } = await supabaseAdmin.from('recurring').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/recurring?id=uuid
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('recurring').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

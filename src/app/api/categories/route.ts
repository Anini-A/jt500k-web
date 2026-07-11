import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function household() {
  const { data } = await supabaseAdmin.from('households').select('id').order('created_at').limit(1).maybeSingle()
  return data?.id as string | undefined
}

// GET /api/categories?type=expense           (lightweight, for the add form)
// GET /api/categories?counts=1               (with tx counts + totals, for the manager)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const withCounts = searchParams.get('counts')

  let query = supabaseAdmin.from('categories').select('*').order('type').order('name')
  if (type) query = query.eq('type', type)
  const { data: cats, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  if (!withCounts) return NextResponse.json(cats, noStore)

  const { data: txns } = await supabaseAdmin.from('transactions').select('category, amount')
  const count = new Map<string, number>()
  const total = new Map<string, number>()
  for (const t of txns ?? []) {
    if (!t.category) continue
    count.set(t.category, (count.get(t.category) || 0) + 1)
    total.set(t.category, (total.get(t.category) || 0) + Number(t.amount))
  }
  return NextResponse.json((cats ?? []).map((c) => ({
    ...c, count: count.get(c.name) || 0, total: Math.round(total.get(c.name) || 0),
  })), noStore)
}

// POST /api/categories  { action, ... }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })

  const action = body.action as string

  if (action === 'create') {
    const { name, type, color } = body
    if (!name?.trim() || !['income', 'expense', 'savings'].includes(type)) {
      return NextResponse.json({ error: 'name and valid type are required' }, { status: 400 })
    }
    const { error } = await supabaseAdmin.from('categories')
      .insert({ household_id: hh, name: name.trim(), type, color: color || null })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'update') {
    const { id, name, type, color } = body
    const { data: existing } = await supabaseAdmin.from('categories').select('*').eq('id', id).maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    const patch: Record<string, unknown> = {}
    if (name?.trim() && name.trim() !== existing.name) patch.name = name.trim()
    if (color !== undefined) patch.color = color
    if (type && type !== existing.type) patch.type = type
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

    const { error } = await supabaseAdmin.from('categories').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // propagate rename + type change to transactions
    const txPatch: Record<string, unknown> = {}
    if (patch.name) txPatch.category = patch.name
    if (patch.type) txPatch.type = patch.type
    if (Object.keys(txPatch).length) {
      await supabaseAdmin.from('transactions').update(txPatch).eq('category_id', id)
      // also match by old name in case some rows lack category_id
      if (patch.name) await supabaseAdmin.from('transactions').update({ category: patch.name, ...(patch.type ? { type: patch.type } : {}) }).eq('category', existing.name)
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'reassign') {
    // move ALL transactions from one category into another
    const { fromId, toId } = body
    const { data: from } = await supabaseAdmin.from('categories').select('*').eq('id', fromId).maybeSingle()
    const { data: to } = await supabaseAdmin.from('categories').select('*').eq('id', toId).maybeSingle()
    if (!from || !to) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    const upd = { category: to.name, category_id: to.id, type: to.type }
    await supabaseAdmin.from('transactions').update(upd).eq('category_id', fromId)
    await supabaseAdmin.from('transactions').update(upd).eq('category', from.name)
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { id, reassignTo } = body
    const { data: cat } = await supabaseAdmin.from('categories').select('*').eq('id', id).maybeSingle()
    if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    const { count } = await supabaseAdmin.from('transactions').select('*', { count: 'exact', head: true }).eq('category', cat.name)
    if ((count ?? 0) > 0) {
      if (!reassignTo) return NextResponse.json({ error: 'Category has transactions — choose one to reassign them to first.' }, { status: 400 })
      const { data: to } = await supabaseAdmin.from('categories').select('*').eq('id', reassignTo).maybeSingle()
      if (!to) return NextResponse.json({ error: 'Target category not found' }, { status: 404 })
      const upd = { category: to.name, category_id: to.id, type: to.type }
      await supabaseAdmin.from('transactions').update(upd).eq('category_id', id)
      await supabaseAdmin.from('transactions').update(upd).eq('category', cat.name)
    }
    const { error } = await supabaseAdmin.from('categories').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

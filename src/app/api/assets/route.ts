import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

async function household() {
  const { data } = await supabaseAdmin.from('households').select('id').order('created_at').limit(1).maybeSingle()
  return data?.id as string | undefined
}

// POST /api/assets  { owner, name, kind?, value }
export async function POST(req: NextRequest) {
  const { owner, name, kind, value } = await req.json().catch(() => ({}))
  if (!owner || !name?.trim() || value == null || isNaN(Number(value))) {
    return NextResponse.json({ error: 'owner, name and value required' }, { status: 400 })
  }
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })
  const { error } = await supabaseAdmin.from('manual_assets')
    .insert({ household_id: hh, owner, name: name.trim(), kind: kind?.trim() || null, value_cad: Number(value) })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

// PATCH /api/assets  { id, owner?, name?, kind?, value? }
export async function PATCH(req: NextRequest) {
  const { id, owner, name, kind, value } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (owner) patch.owner = owner
  if (name?.trim()) patch.name = name.trim()
  if (kind !== undefined) patch.kind = kind?.trim() || null
  if (value != null && !isNaN(Number(value))) patch.value_cad = Number(value)
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const { error } = await supabaseAdmin.from('manual_assets').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/assets?id=uuid
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('manual_assets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

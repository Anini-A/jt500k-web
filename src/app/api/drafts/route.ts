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

// GET /api/drafts — saved import drafts (newest first)
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('import_drafts').select('id, name, rows, updated_at').order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [], noStore)
}

// POST /api/drafts { name?, rows } — create a new draft
export async function POST(req: NextRequest) {
  const { name, rows } = await req.json().catch(() => ({}))
  if (!Array.isArray(rows)) return NextResponse.json({ error: 'rows required' }, { status: 400 })
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('import_drafts')
    .insert({ household_id: hh, name: name?.trim() || null, rows })
    .select('id, name, rows, updated_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/drafts { id, name?, rows } — overwrite an existing draft
export async function PATCH(req: NextRequest) {
  const { id, name, rows } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) patch.name = name?.trim() || null
  if (Array.isArray(rows)) patch.rows = rows
  const { data, error } = await supabaseAdmin.from('import_drafts')
    .update(patch).eq('id', id).select('id, name, rows, updated_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/drafts?id=uuid
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('import_drafts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

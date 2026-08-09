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

// GET /api/cards — the managed credit-card list
export async function GET() {
  const { data, error } = await supabaseAdmin.from('cards').select('id, name').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [], noStore)
}

// POST /api/cards { name }
export async function POST(req: NextRequest) {
  const { name } = await req.json().catch(() => ({}))
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('cards').insert({ household_id: hh, name: name.trim() }).select('id, name').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/cards?id=uuid
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('cards').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

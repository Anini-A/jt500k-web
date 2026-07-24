import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0
const noStore = { headers: { 'Cache-Control': 'no-store' } }

async function household() {
  const { data } = await supabaseAdmin.from('households').select('id').order('created_at').limit(1).maybeSingle()
  return data?.id as string | undefined
}

// GET /api/bill-accounts — the bill accounts (each has its own balance + buffer)
export async function GET() {
  const { data, error } = await supabaseAdmin.from('bill_accounts').select('*').order('sort', { ascending: true }).order('created_at', { ascending: true })
  if (error) return NextResponse.json({ accounts: [] }, noStore) // table may not exist yet
  return NextResponse.json({ accounts: data || [] }, noStore)
}

// POST /api/bill-accounts — create an account { name }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!b.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const hh = await household(); if (!hh) return NextResponse.json({ error: 'No household' }, { status: 400 })
  const { count } = await supabaseAdmin.from('bill_accounts').select('id', { count: 'exact', head: true })
  const { data, error } = await supabaseAdmin.from('bill_accounts').insert({
    household_id: hh, name: b.name.trim(),
    current_balance: Number(b.current_balance) || 0, balance_as_of: b.balance_as_of || new Date().toISOString().slice(0, 10),
    buffer: Number(b.buffer) || 0, sort: count || 0,
  }).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id }, { status: 201 })
}

// PATCH /api/bill-accounts — update { id, name?, current_balance?, balance_as_of?, buffer? }
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (b.name?.trim()) patch.name = b.name.trim()
  if (b.current_balance != null) patch.current_balance = Number(b.current_balance)
  if (b.balance_as_of !== undefined) patch.balance_as_of = b.balance_as_of || null
  if (b.buffer != null) patch.buffer = Number(b.buffer)
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  const { error } = await supabaseAdmin.from('bill_accounts').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/bill-accounts?id=  (cascades its bills)
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('bill_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

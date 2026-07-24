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

const DEFAULT_SETTINGS = { current_balance: 0, balance_as_of: null, deposit_day: 28, deposit_amount: 0, buffer: 0 }

// GET /api/bills — every bill (each tagged with its account_id) + the accounts
export async function GET() {
  const { data: bills, error } = await supabaseAdmin.from('bills').select('*').order('day', { ascending: true })
  if (error) return NextResponse.json({ bills: [], accounts: [], settings: DEFAULT_SETTINGS }, noStore) // table may not exist yet
  const { data: accounts } = await supabaseAdmin.from('bill_accounts').select('*').order('sort', { ascending: true }).order('created_at', { ascending: true }).then((r) => r, () => ({ data: [] }))
  return NextResponse.json({ bills: (bills || []).filter((b) => b.active !== false), accounts: accounts || [], settings: DEFAULT_SETTINGS }, noStore)
}

// POST /api/bills — add a bill { account_id, name, day, amount, quarterly?, next_due? }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!b.name?.trim() || b.day == null || b.amount == null) return NextResponse.json({ error: 'name, day and amount required' }, { status: 400 })
  const hh = await household(); if (!hh) return NextResponse.json({ error: 'No household' }, { status: 400 })
  const { error } = await supabaseAdmin.from('bills').insert({
    household_id: hh, account_id: b.account_id || null, name: b.name.trim(), day: Math.max(1, Math.min(31, Number(b.day))),
    amount: Number(b.amount), quarterly: !!b.quarterly, next_due: b.next_due || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

// PATCH /api/bills — edit a bill { id, ... }
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (b.name?.trim()) patch.name = b.name.trim()
  if (b.day != null) patch.day = Math.max(1, Math.min(31, Number(b.day)))
  if (b.amount != null) patch.amount = Number(b.amount)
  if (b.quarterly !== undefined) patch.quarterly = !!b.quarterly
  if (b.next_due !== undefined) patch.next_due = b.next_due || null
  if (b.account_id !== undefined) patch.account_id = b.account_id || null
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  const { error } = await supabaseAdmin.from('bills').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/bills?id=
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('bills').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

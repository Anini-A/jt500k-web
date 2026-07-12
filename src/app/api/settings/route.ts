import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function GET() {
  const { data: household, error } = await supabaseAdmin
    .from('households')
    .select('id, name, goal_amount')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!household) return NextResponse.json({ error: 'No household found. Run the import first.' }, { status: 404 })

  const { count } = await supabaseAdmin
    .from('transactions').select('*', { count: 'exact', head: true })

  // date range
  const { data: first } = await supabaseAdmin
    .from('transactions').select('date').order('date', { ascending: true }).limit(1).maybeSingle()
  const { data: last } = await supabaseAdmin
    .from('transactions').select('date').order('date', { ascending: false }).limit(1).maybeSingle()

  const { count: catCount } = await supabaseAdmin
    .from('categories').select('*', { count: 'exact', head: true })

  return NextResponse.json({
    id: household.id,
    name: household.name,
    goalAmount: Number(household.goal_amount),
    transactionCount: count ?? 0,
    categoryCount: catCount ?? 0,
    firstDate: first?.date ?? null,
    lastDate: last?.date ?? null,
  })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (body.goalAmount != null && !isNaN(Number(body.goalAmount)) && Number(body.goalAmount) > 0) {
    patch.goal_amount = Number(body.goalAmount)
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: household } = await supabaseAdmin
    .from('households').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!household) return NextResponse.json({ error: 'No household found' }, { status: 404 })

  const { error } = await supabaseAdmin.from('households').update(patch).eq('id', household.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

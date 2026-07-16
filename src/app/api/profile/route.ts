import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const EMPTY = { sections: [], links: [] }

// GET /api/profile — the household KYC profile (members, home, insurance, estate…)
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('household_profile').select('data').order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return NextResponse.json(EMPTY, { headers: { 'Cache-Control': 'no-store' } }) // table may not exist yet
  return NextResponse.json(data?.data || EMPTY, { headers: { 'Cache-Control': 'no-store' } })
}

// PUT /api/profile — replace the whole profile document
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid profile' }, { status: 400 })

  const { data: hh } = await supabaseAdmin.from('households').select('id').order('created_at').limit(1).maybeSingle()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })

  const { error } = await supabaseAdmin.from('household_profile')
    .upsert({ household_id: hh.id, data: body, updated_at: new Date().toISOString() }, { onConflict: 'household_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

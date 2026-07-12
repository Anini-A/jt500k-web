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

// GET /api/holdings — all holdings + grouped accounts + owner totals.
export async function GET() {
  const { data, error } = await supabaseAdmin.from('holdings').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data ?? []).map((h) => ({
    ...h,
    quantity: Number(h.quantity), market_price: Number(h.market_price),
    book_value_cad: Number(h.book_value_cad), market_value_cad: Number(h.market_value_cad),
  }))
  // manually-added assets (chequing, options, …) — count toward AUM
  const { data: assetsRaw } = await supabaseAdmin.from('manual_assets').select('*')
  const assets = (assetsRaw ?? []).map((a) => ({ ...a, value_cad: Number(a.value_cad) }))
  const assetsTotal = assets.reduce((s, a) => s + a.value_cad, 0)

  const totalValue = rows.reduce((s, h) => s + h.market_value_cad, 0) + assetsTotal
  const totalCost = rows.reduce((s, h) => s + h.book_value_cad, 0) + assetsTotal
  const ownerTotals: Record<string, number> = {}
  for (const h of rows) ownerTotals[h.owner] = (ownerTotals[h.owner] || 0) + h.market_value_cad
  for (const a of assets) ownerTotals[a.owner] = (ownerTotals[a.owner] || 0) + a.value_cad
  const asOf = rows.reduce((mx, h) => (h.as_of && h.as_of > mx ? h.as_of : mx), '')

  return NextResponse.json({
    rows,
    assets,
    totalValue: Math.round(totalValue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    ownerTotals,
    asOf: asOf || null,
  }, noStore)
}

// POST /api/holdings  { uploader: 'Jean'|'Henriette', rows: [...] }
// Dedups on account_number+symbol; RESP → Noah; account shared with another
// person → Joint. Re-uploads update in place.
export async function POST(req: NextRequest) {
  const { uploader, rows } = await req.json().catch(() => ({}))
  if (!uploader || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'uploader and rows required' }, { status: 400 })
  }
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })

  // existing owner per account_number
  const { data: existing } = await supabaseAdmin.from('holdings').select('account_number, owner').eq('household_id', hh)
  const existingOwner = new Map<string, string>()
  for (const e of existing ?? []) if (!existingOwner.has(e.account_number)) existingOwner.set(e.account_number, e.owner)

  const isRESP = (t: string) => (t || '').toUpperCase().includes('RESP')

  // decide owner per incoming account, and which existing accounts become Joint
  const incomingAccounts = new Set<string>(rows.map((r: any) => r.account_number))
  const toJoint: string[] = []
  const ownerForAccount = new Map<string, string>()
  for (const acct of incomingAccounts) {
    const anyRow = rows.find((r: any) => r.account_number === acct)
    if (isRESP(anyRow.account_type)) { ownerForAccount.set(acct, 'Noah'); continue }
    const prev = existingOwner.get(acct)
    if (prev && prev !== uploader && prev !== 'Noah') { ownerForAccount.set(acct, 'Joint'); toJoint.push(acct) }
    else ownerForAccount.set(acct, prev === 'Joint' ? 'Joint' : uploader)
  }

  // retag existing rows of newly-joint accounts
  for (const acct of toJoint) {
    await supabaseAdmin.from('holdings').update({ owner: 'Joint' }).eq('household_id', hh).eq('account_number', acct)
  }

  const upserts = rows.map((r: any) => ({
    household_id: hh,
    owner: ownerForAccount.get(r.account_number)!,
    account_type: r.account_type,
    account_number: r.account_number,
    symbol: r.symbol,
    name: r.name ?? null,
    currency: r.currency ?? 'CAD',
    quantity: Number(r.quantity),
    market_price: Number(r.market_price),
    book_value_cad: Number(r.book_value_cad),
    market_value_cad: Number(r.market_value_cad),
    as_of: r.as_of ?? new Date().toISOString().slice(0, 10),
  }))

  const { error } = await supabaseAdmin.from('holdings')
    .upsert(upserts, { onConflict: 'household_id,account_number,symbol' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, imported: upserts.length }, { status: 201 })
}

// DELETE /api/holdings?owner=Jean  (or all)
export async function DELETE(req: NextRequest) {
  const owner = new URL(req.url).searchParams.get('owner')
  const hh = await household()
  if (!hh) return NextResponse.json({ error: 'No household found' }, { status: 400 })
  let q = supabaseAdmin.from('holdings').delete().eq('household_id', hh)
  if (owner) q = q.eq('owner', owner)
  else q = q.neq('id', '00000000-0000-0000-0000-000000000000')
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

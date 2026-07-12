import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0
export const maxDuration = 30

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, accept: 'application/json', 'accept-language': 'en-US,en;q=0.9' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Live price from Yahoo Finance chart endpoint (query2 primary, query1 fallback).
async function yahoo(ticker: string): Promise<{ price: number; currency: string } | null> {
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const r = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
        { headers: HEADERS, cache: 'no-store' })
      if (!r.ok) continue
      const j = await r.json()
      const m = j?.chart?.result?.[0]?.meta
      const price = m?.regularMarketPrice
      if (typeof price === 'number') return { price, currency: m?.currency || 'CAD' }
    } catch { /* try next host */ }
  }
  return null
}

async function btcCad(): Promise<number | null> {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=cad',
      { headers: { accept: 'application/json' }, cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json()
    return typeof j?.bitcoin?.cad === 'number' ? j.bitcoin.cad : null
  } catch { return null }
}

// TSX (CAD) symbols → Yahoo needs ".TO"; share-class dot → dash. USD → as-is.
function yahooTicker(symbol: string, currency: string): string {
  if (currency === 'USD') return symbol
  return symbol.replace(/\./g, '-') + '.TO'
}

// POST /api/holdings/refresh — pull live prices, recompute CAD values.
export async function POST() {
  const { data: holds, error } = await supabaseAdmin.from('holdings').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = holds ?? []
  if (rows.length === 0) return NextResponse.json({ updated: 0, failed: [], note: 'No holdings' })

  const symbols = [...new Map(rows.map((h) => [h.symbol, h.currency])).entries()]
  const needFx = rows.some((h) => h.currency === 'USD')

  // FX (USD→CAD) and BTC in parallel
  const [fxq, btc] = await Promise.all([
    needFx ? yahoo('CAD=X') : Promise.resolve(null),
    rows.some((h) => h.symbol === 'BTC') ? btcCad() : Promise.resolve(null),
  ])
  const fx = fxq?.price ?? 1.39

  // fetch each symbol's price sequentially (parallel bursts get 429'd) → { native, cad }
  const priceInfo = new Map<string, { native: number; cad: number }>()
  for (const [symbol, currency] of symbols) {
    if (symbol === 'BTC') { if (btc) priceInfo.set('BTC', { native: btc, cad: btc }); continue }
    const q = await yahoo(yahooTicker(symbol, currency))
    if (q) priceInfo.set(symbol, { native: q.price, cad: q.currency === 'USD' ? q.price * fx : q.price })
    await sleep(120)
  }

  const today = new Date().toISOString().slice(0, 10)
  const failed = new Set<string>()
  let updated = 0

  await Promise.all(rows.map(async (h) => {
    const p = priceInfo.get(h.symbol)
    if (!p) { failed.add(h.symbol); return }
    const mv = Math.round(Number(h.quantity) * p.cad * 100) / 100
    const { error: e } = await supabaseAdmin.from('holdings')
      .update({ market_price: p.native, market_value_cad: mv, as_of: today })
      .eq('id', h.id)
    if (e) failed.add(h.symbol); else updated++
  }))

  return NextResponse.json({
    updated,
    failed: [...failed],
    fx: Math.round(fx * 10000) / 10000,
    asOf: today,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

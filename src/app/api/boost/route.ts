import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { computeNetWorth } from '@/lib/networth'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

const GEMINI_KEY = process.env.GEMINI_API_KEY
const money = (n: number) => '$' + Math.round(n).toLocaleString()

// GET /api/boost — one short, upbeat, specific "aha" line for the flick-coin,
// written by Gemini from the household's real numbers. Falls back to null so
// the client can use its local pool.
export async function GET() {
  try {
    const nw = await computeNetWorth()
    const { data: hh } = await supabaseAdmin.from('households').select('goal_amount').order('created_at').limit(1).maybeSingle()
    const goal = Number(hh?.goal_amount) || 500000
    const pct = Math.round((nw.netWorth / goal) * 100)

    // this month's savings rate
    const { data: txns } = await supabaseAdmin.from('transactions').select('type, amount, date')
    const month = new Date().toISOString().slice(0, 7)
    let inc = 0, sav = 0
    for (const t of txns ?? []) {
      if ((t.date as string).slice(0, 7) !== month) continue
      if (t.type === 'income') inc += Number(t.amount)
      else if (t.type === 'savings') sav += Number(t.amount)
    }
    const rate = inc > 0 ? Math.round((sav / inc) * 100) : null

    if (!GEMINI_KEY) return NextResponse.json({ text: null })

    const facts = [
      `net worth ${money(nw.netWorth)} (${pct}% of the ${money(goal)} goal)`,
      rate != null ? `saved ${rate}% of income this month` : '',
      `debts remaining ${money(nw.debts)}`,
    ].filter(Boolean).join('; ')

    const prompt = `You are a warm, sharp "Family CFO" for a household on a journey to ${money(goal)}. ` +
      `Write ONE short line (max 12 words) that gives them a genuine lift or a small "aha" — encouraging and specific to their numbers, never generic filler. ` +
      `End with exactly one fitting emoji. No quotes, no hashtags, no preamble. Their numbers: ${facts}.`

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 60, temperature: 1.0 },
    }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) return NextResponse.json({ text: null })
    const d = await r.json()
    const text = (d?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text).filter(Boolean).join('').trim().replace(/^["']|["']$/g, '')
    return NextResponse.json({ text: text || null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ text: null })
  }
}

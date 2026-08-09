import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0
export const maxDuration = 30

const GEMINI_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'

// Turn a raw bank/credit-card paste into structured transactions mapped to the
// user's own categories. Reuses the same Gemini key as the chat assistant.
export async function POST(req: NextRequest) {
  if (!GEMINI_KEY) return NextResponse.json({ error: 'AI parser not configured' }, { status: 500 })
  try {
    const { text, today } = await req.json().catch(() => ({}))
    const raw = String(text || '').trim()
    if (!raw) return NextResponse.json({ error: 'Nothing to parse.' }, { status: 400 })

    const { data: cats } = await supabaseAdmin.from('categories').select('name, type')
    const catList = (cats ?? [])
    const expenseCats = catList.filter((c) => c.type === 'expense').map((c) => c.name)
    const typeByName = new Map(catList.map((c) => [c.name.toLowerCase(), c.type]))
    const validNames = catList.map((c) => c.name)

    const todayStr = /^\d{4}-\d{2}-\d{2}$/.test(String(today)) ? today : new Date().toISOString().slice(0, 10)

    const system =
      `You extract credit-card / bank transactions from raw pasted text into JSON. ` +
      `Return ONLY a JSON array; each element: {"date":"YYYY-MM-DD","description":string,"category":string,"amount":number}. ` +
      `Rules:\n` +
      `- One element per real purchase/charge. INCLUDE both pending and posted transactions. ` +
      `SKIP non-transaction lines: totals ("Total", "Grand Total"), card names/headers, "Pending transaction"/"Posted transactions" labels, balances, credit limits, times.\n` +
      `- amount = a POSITIVE number (strip $ and commas). Payments/refunds/credits to the card are NOT purchases — skip them.\n` +
      `- description = the clean merchant name (e.g. "UBER CANADA/UBEREATS", "REAL CDN SUPERSTORE #1").\n` +
      `- date = the transaction date in YYYY-MM-DD. If a row shows only a time, use its date. If no year, assume ${todayStr.slice(0, 4)}.\n` +
      `- category = the SINGLE best match from this EXACT list (use these strings verbatim): ${validNames.join(', ')}.\n` +
      `  Map bank categories to the closest one, e.g. "Food & groceries"→"Food", "Restaurants & bars"→"Food", ` +
      `"Transportation & car"/"Gas"→"Transportation", "Shopping"→"Personal", "Home"→"Housing". ` +
      `If unsure, pick the most likely expense category (default "Misc" if it exists). Never invent a category outside the list.\n` +
      `Return [] if there are no transactions.`

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: raw }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }

    const models = [GEMINI_MODEL, 'gemini-2.5-flash-lite', 'gemini-2.5-flash']
    let out: any = null, lastErr = ''
    for (const model of models) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { lastErr = (await r.text()).slice(0, 200); continue }
      const d = await r.json()
      const txt = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''
      try { out = JSON.parse(txt); break } catch { lastErr = 'bad JSON from model'; continue }
    }
    if (!Array.isArray(out)) return NextResponse.json({ error: lastErr || 'Could not parse.' }, { status: 502 })

    // normalize + attach the authoritative type from the category
    const nameByLower = new Map(validNames.map((n) => [n.toLowerCase(), n]))
    const fallback = expenseCats.includes('Misc') ? 'Misc' : (expenseCats[0] || '')
    const rows = out
      .map((o: any) => {
        const category = nameByLower.get(String(o.category || '').toLowerCase().trim()) || fallback
        const amount = Math.abs(Number(o.amount) || 0)
        return {
          date: /^\d{4}-\d{2}-\d{2}$/.test(String(o.date)) ? o.date : todayStr,
          description: String(o.description || '').trim().slice(0, 120),
          category,
          type: typeByName.get(category.toLowerCase()) || 'expense',
          amount: Math.round(amount * 100) / 100,
        }
      })
      .filter((r: any) => r.amount > 0)

    return NextResponse.json({ rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Free provider (Google Gemini) is preferred when its key is present; Anthropic
// stays as an automatic paid fallback. Get a free key at https://aistudio.google.com/apikey
const GEMINI_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const ANTHROPIC_KEY =
  process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY

// Build a compact financial context so Claude can answer accurately.
async function buildContext() {
  const { data } = await supabaseAdmin
    .from('transactions')
    .select('type, amount, date, category, description')

  const txns = data ?? []
  let income = 0, expense = 0, savings = 0
  const byCat = new Map<string, number>()
  const byMonth = new Map<string, { i: number; e: number; s: number }>()

  for (const t of txns) {
    const amt = Number(t.amount) || 0
    const month = (t.date as string).slice(0, 7)
    if (!byMonth.has(month)) byMonth.set(month, { i: 0, e: 0, s: 0 })
    const m = byMonth.get(month)!
    if (t.type === 'income') { income += amt; m.i += amt }
    else if (t.type === 'expense') { expense += amt; m.e += amt; byCat.set(t.category, (byCat.get(t.category) || 0) + amt) }
    else if (t.type === 'savings') { savings += amt; m.s += amt }
  }

  const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([c, v]) => `  - ${c}: $${Math.round(v).toLocaleString()}`).join('\n')
  const months = [...byMonth.entries()].sort().slice(-6)
    .map(([mo, v]) => `  - ${mo}: income $${Math.round(v.i)}, expenses $${Math.round(v.e)}, savings $${Math.round(v.s)}`).join('\n')

  return `The user is tracking their finances toward a $500,000 savings goal ("Journey to 500K"). All amounts are in CAD.

TOTALS (all time, ${txns.length} transactions since Aug 2024):
- Total income: $${Math.round(income).toLocaleString()}
- Total expenses: $${Math.round(expense).toLocaleString()}
- Total saved/invested: $${Math.round(savings).toLocaleString()}
- Current cash balance (income - expenses - savings set aside): $${Math.round(income - expense - savings).toLocaleString()}
- Savings rate: ${income > 0 ? Math.round((savings / income) * 100) : 0}%
- Progress to $500K: ${Math.round((savings / 500000) * 100)}%

TOP EXPENSE CATEGORIES:
${topCats}

LAST 6 MONTHS:
${months}`
}

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY && !ANTHROPIC_KEY) {
    return NextResponse.json({ error: 'AI is not configured (add a free GEMINI_API_KEY).' }, { status: 500 })
  }

  const { message, history } = await req.json()
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const context = await buildContext()
  const system =
    `You are a friendly, sharp personal-finance assistant for the "Journey to 500K" app. ` +
    `Answer using ONLY the data below. Be concise, concrete, and encouraging. Use CAD ($). ` +
    `When useful, give specific numbers and one actionable suggestion.\n\n${context}`

  const prior = Array.isArray(history) ? history : []
  const messages = [...prior, { role: 'user', content: message }]

  try {
    // ---- Free: Google Gemini ----
    if (GEMINI_KEY) {
      const contents = messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content ?? '') }],
      }))
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents,
            generationConfig: { maxOutputTokens: 1024, temperature: 0.5 },
          }),
        },
      )
      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: 'AI error: ' + err.slice(0, 200) }, { status: 502 })
      }
      const data = await res.json()
      const reply = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? 'Sorry, I could not generate a response.'
      return NextResponse.json({ reply })
    }

    // ---- Paid fallback: Anthropic ----
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_KEY as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system,
        messages,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'AI error: ' + err.slice(0, 200) }, { status: 502 })
    }

    const data = await res.json()
    const reply = data.content?.[0]?.text ?? 'Sorry, I could not generate a response.'
    return NextResponse.json({ reply })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

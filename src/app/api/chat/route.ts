import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Free provider (Google Gemini) is preferred when its key is present; Anthropic
// stays as an automatic paid fallback. Get a free key at https://aistudio.google.com/apikey
const GEMINI_KEY = process.env.GEMINI_API_KEY
// Rolling alias — always resolves to the current free Flash model (avoids
// "model no longer available" breakage when Google retires a dated version).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'
const ANTHROPIC_KEY =
  process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY

const norm = (s: string | null) => (s || '').trim().toLowerCase()

// Build a compact financial context so the assistant can answer accurately.
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

  // NET WORTH — this is the real "Journey to 500K" metric (Investments + Cash − Debts)
  const { data: holds } = await supabaseAdmin.from('holdings').select('market_value_cad')
  const { data: manual } = await supabaseAdmin.from('manual_assets').select('value_cad')
  const holdingsValue = (holds ?? []).reduce((s, h) => s + Number(h.market_value_cad), 0)
  const cashValue = (manual ?? []).reduce((s, a) => s + Number(a.value_cad), 0)
  const { data: debts } = await supabaseAdmin.from('debts').select('name, amount')
  const { data: pays } = await supabaseAdmin.from('transactions').select('description, amount').eq('category', 'Debt Repayment')
  const paidByName = new Map<string, number>()
  for (const p of pays ?? []) paidByName.set(norm(p.description), (paidByName.get(norm(p.description)) || 0) + Number(p.amount))
  const debtsRemaining = (debts ?? []).reduce((s, d) => s + Math.max(0, Number(d.amount) - (paidByName.get(norm(d.name)) || 0)), 0)
  const netWorth = holdingsValue + cashValue - debtsRemaining

  // goal amount (defaults to 500K)
  const { data: hh } = await supabaseAdmin.from('households').select('goal_amount').order('created_at').limit(1).maybeSingle()
  const goal = Number(hh?.goal_amount) || 500000
  const money = (n: number) => '$' + Math.round(n).toLocaleString()

  const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([c, v]) => `  - ${c}: ${money(v)}`).join('\n')
  const months = [...byMonth.entries()].sort().slice(-6)
    .map(([mo, v]) => `  - ${mo}: income ${money(v.i)}, expenses ${money(v.e)}, savings ${money(v.s)}`).join('\n')

  return `The user is tracking their finances toward a ${money(goal)} goal ("Journey to 500K"). All amounts are in CAD.

⭐ THE GOAL METRIC IS NET WORTH, NOT the savings-contributions total. "Progress to the goal" = net worth ÷ goal. Do NOT use the "total saved/invested" figure below as progress toward the goal.

NET WORTH (current) = ${money(netWorth)}  →  ${Math.round((netWorth / goal) * 100)}% of the ${money(goal)} goal
- Investments (Wealthsimple holdings): ${money(holdingsValue)}
- Cash & other assets: ${money(cashValue)}
- Debts remaining (subtracted): ${money(debtsRemaining)}

CASH-FLOW TOTALS (all time, ${txns.length} transactions since Aug 2024):
- Total income: ${money(income)}
- Total expenses: ${money(expense)}
- Total savings CONTRIBUTIONS (money set aside — a cash-flow figure, NOT the goal progress): ${money(savings)}
- Current cash balance (income − expenses − savings set aside): ${money(income - expense - savings)}
- Savings rate: ${income > 0 ? Math.round((savings / income) * 100) : 0}%

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
            // 2.5 Flash "thinks" by default and those tokens eat the output budget,
            // truncating answers — disable thinking and give the reply room.
            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.5,
              thinkingConfig: { thinkingBudget: 0 },
            },
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

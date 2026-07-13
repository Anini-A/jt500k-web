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

// Tools the assistant can call. Writes are never executed here — the route returns
// a proposed action and the client confirms before calling the real API.
const TOOLS = [{
  function_declarations: [
    {
      name: 'add_transaction',
      description: 'Add one new transaction (income, expense, or savings contribution).',
      parameters: { type: 'OBJECT', properties: {
        date: { type: 'STRING', description: 'YYYY-MM-DD; omit for today' },
        type: { type: 'STRING', enum: ['income', 'expense', 'savings'] },
        category: { type: 'STRING', description: 'an exact existing category name' },
        amount: { type: 'NUMBER' },
        description: { type: 'STRING' },
      }, required: ['type', 'category', 'amount'] },
    },
    { name: 'edit_transaction', description: 'Edit fields of an existing transaction by id.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, date: { type: 'STRING' }, category: { type: 'STRING' }, amount: { type: 'NUMBER' }, description: { type: 'STRING' } }, required: ['id'] } },
    { name: 'delete_transaction', description: 'Delete a transaction by id.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' } }, required: ['id'] } },
    { name: 'add_budget_item', description: 'Add a monthly budget line item.', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, category: { type: 'STRING' }, amount: { type: 'NUMBER', description: 'monthly amount' } }, required: ['name', 'category', 'amount'] } },
    { name: 'edit_budget_item', description: 'Edit a budget line item by id.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, name: { type: 'STRING' }, category: { type: 'STRING' }, amount: { type: 'NUMBER' } }, required: ['id'] } },
    { name: 'delete_budget_item', description: 'Delete a budget line item by id.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' } }, required: ['id'] } },
    { name: 'add_recurring', description: 'Add a recurring template (rent, subscription, paycheque…).', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, type: { type: 'STRING', enum: ['income', 'expense', 'savings'] }, category: { type: 'STRING' }, amount: { type: 'NUMBER' }, description: { type: 'STRING' } }, required: ['name', 'type', 'category', 'amount'] } },
    { name: 'edit_recurring', description: 'Edit a recurring template by id.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, name: { type: 'STRING' }, type: { type: 'STRING', enum: ['income', 'expense', 'savings'] }, category: { type: 'STRING' }, amount: { type: 'NUMBER' }, description: { type: 'STRING' } }, required: ['id'] } },
    { name: 'log_recurring', description: 'Post the chosen recurring items as real transactions for a given date (e.g. "log this month\'s recurring items"). Pass the ids of the recurring items to log.', parameters: { type: 'OBJECT', properties: { ids: { type: 'ARRAY', items: { type: 'STRING' }, description: 'ids of active recurring items to log' }, date: { type: 'STRING', description: 'YYYY-MM-DD; omit for today' } }, required: ['ids'] } },
    { name: 'set_goal', description: 'Change the overall savings goal amount (the 500K target).', parameters: { type: 'OBJECT', properties: { amount: { type: 'NUMBER' } }, required: ['amount'] } },
  ],
}]

const cad = (n: any) => '$' + Math.round(Number(n) || 0).toLocaleString()
// Human-readable summary of a proposed action for the confirmation card.
function describeAction(name: string, a: any): string {
  switch (name) {
    case 'add_transaction': return `Add ${a.type} of ${cad(a.amount)} in "${a.category}"${a.description ? ` — ${a.description}` : ''}${a.date ? ` on ${a.date}` : ' (today)'}`
    case 'edit_transaction': return `Edit transaction ${String(a.id).slice(0, 8)}…${a.amount != null ? ` → ${cad(a.amount)}` : ''}${a.category ? ` → ${a.category}` : ''}${a.description ? ` → "${a.description}"` : ''}${a.date ? ` → ${a.date}` : ''}`
    case 'delete_transaction': return `Delete transaction ${String(a.id).slice(0, 8)}…`
    case 'add_budget_item': return `Add budget item "${a.name}" in ${a.category} — ${cad(a.amount)}/mo`
    case 'edit_budget_item': return `Edit budget item ${String(a.id).slice(0, 8)}…${a.amount != null ? ` → ${cad(a.amount)}/mo` : ''}${a.name ? ` → "${a.name}"` : ''}${a.category ? ` → ${a.category}` : ''}`
    case 'delete_budget_item': return `Delete budget item ${String(a.id).slice(0, 8)}…`
    case 'add_recurring': return `Add recurring ${a.type} "${a.name}" in ${a.category} — ${cad(a.amount)}`
    case 'edit_recurring': return `Edit recurring ${String(a.id).slice(0, 8)}…${a.amount != null ? ` → ${cad(a.amount)}` : ''}${a.name ? ` → "${a.name}"` : ''}${a.category ? ` → ${a.category}` : ''}`
    case 'log_recurring': return `Log ${(a.ids || []).length} recurring item${(a.ids || []).length !== 1 ? 's' : ''} as transactions${a.date ? ` on ${a.date}` : ' (today)'}`
    case 'set_goal': return `Change the goal to ${cad(a.amount)}`
    default: return name
  }
}

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

  // reference data so the assistant can act with valid names / ids
  const { data: cats } = await supabaseAdmin.from('categories').select('name, type')
  const catsByType = (type: string) => (cats ?? []).filter((c) => c.type === type).map((c) => c.name).join(', ')
  const { data: budgetRows } = await supabaseAdmin.from('budgets').select('id, name, category, amount').order('category')
  const { data: recRows } = await supabaseAdmin.from('recurring').select('id, name, type, category, amount').eq('active', true)

  const recent = [...txns]
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 25)
    .map((t: any) => `  - id=${t.id ?? '?'} · ${t.date} · ${t.type} · ${t.category ?? '—'} · ${t.description ?? '—'} · ${money(Number(t.amount))}`).join('\n')

  const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([c, v]) => `  - ${c}: ${money(v)}`).join('\n')
  const months = [...byMonth.entries()].sort().slice(-6)
    .map(([mo, v]) => `  - ${mo}: income ${money(v.i)}, expenses ${money(v.e)}, savings ${money(v.s)}`).join('\n')
  const budgetList = (budgetRows ?? []).map((b) => `  - id=${b.id} · ${b.category} · ${b.name} · ${money(Number(b.amount))}/mo`).join('\n')
  const recList = (recRows ?? []).map((r) => `  - id=${r.id} · ${r.type} · ${r.category} · ${r.name} · ${money(Number(r.amount))}`).join('\n')

  return `Today is ${new Date().toISOString().slice(0, 10)}. The user is tracking their finances toward a ${money(goal)} goal ("Journey to 500K"). All amounts are in CAD.

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
${months}

VALID CATEGORY NAMES (use these exact names when adding/editing — never invent one):
- income: ${catsByType('income')}
- expense: ${catsByType('expense')}
- savings: ${catsByType('savings')}

RECENT TRANSACTIONS (most recent 25 — use the exact id to edit or delete one):
${recent}

BUDGET LINE ITEMS (use the id to edit or delete one):
${budgetList || '  (none)'}

ACTIVE RECURRING ITEMS:
${recList || '  (none)'}`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Call Gemini with the tool set. Retries once on transient overload, then falls
// back through other free Flash models so a spike on one doesn't fail the request.
async function geminiGenerate({ system, contents }: { system: string; contents: any[] }) {
  const models = [GEMINI_MODEL, 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
    .filter((m, i, a) => m && a.indexOf(m) === i)
  let lastErr = ''
  for (const model of models) {
    // 2.0 Flash doesn't accept thinkingConfig; only send it to 2.5-class models
    const supportsThinking = !/2\.0/.test(model)
    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents,
      tools: TOOLS,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.5,
        ...(supportsThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      } catch (e: any) { lastErr = e.message; break }
      if (res.ok) return { ok: true as const, data: await res.json() }
      lastErr = await res.text()
      const transient = res.status === 503 || res.status === 429 || /UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED/i.test(lastErr)
      if (transient && attempt === 0) { await sleep(700); continue } // retry same model once
      break // give up on this model → try the next one
    }
  }
  return { ok: false as const, err: lastErr }
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
    `When useful, give specific numbers and one actionable suggestion.\n\n` +
    `YOU CAN TAKE ACTIONS via the provided tools: adding/editing/deleting transactions, ` +
    `adding/editing/deleting budget items, adding/editing recurring items, logging recurring ` +
    `items as transactions, and changing the goal amount. ` +
    `Call a tool ONLY when the user clearly asks to record or change something. ` +
    `You MAY call several tools in one turn when the user asks for multiple changes (e.g. add three ` +
    `expenses) — they are confirmed together. To "log this/last month's recurring items", call ` +
    `log_recurring with the ids of the relevant ACTIVE RECURRING ITEMS. ` +
    `Use the exact category names listed; use the exact id from the data for any edit/delete/log. ` +
    `If the date is unspecified, use today's date. Never guess an id — if you can't find it, ask. ` +
    `The app will ask the user to confirm before changes are saved, so you don't need to ask for confirmation yourself.\n\n${context}`

  const prior = Array.isArray(history) ? history : []
  const messages = [...prior, { role: 'user', content: message }]

  try {
    // ---- Free: Google Gemini (auto-retry + model fallback on overload) ----
    if (GEMINI_KEY) {
      const contents = messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content ?? '') }],
      }))
      const r = await geminiGenerate({ system, contents })
      if (!r.ok) {
        const overloaded = /UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED|503|429/i.test(r.err)
        const msg = overloaded
          ? 'The free AI is busy right now — please try again in a few seconds.'
          : 'AI error: ' + r.err.slice(0, 200)
        return NextResponse.json({ error: msg }, { status: 502 })
      }
      const parts = r.data.candidates?.[0]?.content?.parts ?? []
      // If the model wants to act, return the proposed action(s) for the user to confirm.
      const calls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall)
      if (calls.length) {
        return NextResponse.json({ actions: calls.map((c: any) => ({ name: c.name, args: c.args || {}, label: describeAction(c.name, c.args || {}) })) })
      }
      const reply = parts.map((p: any) => p.text).filter(Boolean).join('') || 'Sorry, I could not generate a response.'
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

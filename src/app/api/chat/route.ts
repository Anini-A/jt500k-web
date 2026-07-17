import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Free provider (Google Gemini) is preferred when its key is present; Anthropic
// stays as an automatic paid fallback. Get a free key at https://aistudio.google.com/apikey
const GEMINI_KEY = process.env.GEMINI_API_KEY
// Fuller Flash for better reasoning/understanding (still cents/month on paid tier);
// falls back to lite/2.0 on overload. Override with GEMINI_MODEL.
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
    { name: 'refresh_prices', description: 'Pull live market prices and update the value of the investment holdings.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'find_transactions', description: 'Search ALL transactions (not just the recent 25) to get their ids before editing/deleting an older one. Call this first when the user references a transaction you cannot see in the recent list.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'text to match in description/category' }, category: { type: 'STRING' }, type: { type: 'STRING', enum: ['income', 'expense', 'savings'] }, limit: { type: 'NUMBER' } } } },
  ],
}]

// exact amount in the confirmation label (cents shown when present — never rounded)
const cad = (n: any) => {
  const x = Number(n) || 0
  return '$' + x.toLocaleString('en-CA', { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 })
}
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
    case 'refresh_prices': return 'Refresh live investment prices'
    default: return name
  }
}

// Read-only transaction search (auto-executed, never needs confirmation).
async function searchTransactions(a: any) {
  let q = supabaseAdmin.from('transactions').select('id, date, type, category, description, amount')
    .order('date', { ascending: false }).limit(Math.min(Number(a.limit) || 15, 30))
  if (a.type) q = q.eq('type', a.type)
  if (a.category) q = q.eq('category', a.category)
  if (a.query) {
    const term = String(a.query).replace(/[%,()]/g, ' ').trim()
    if (term) q = q.or(`description.ilike.%${term}%,category.ilike.%${term}%`)
  }
  const { data } = await q
  return data ?? []
}

// Pull functionCalls + text out of a Gemini response.
function parseGemini(data: any) {
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const calls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall)
  const reply = parts.map((p: any) => p.text).filter(Boolean).join('')
  return { calls, reply }
}

// Build a compact financial context so the assistant can answer accurately.
async function buildContext() {
  const { data } = await supabaseAdmin
    .from('transactions')
    .select('id, type, amount, date, category, description')

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
  const { data: holds } = await supabaseAdmin.from('holdings').select('owner, account_type, symbol, name, quantity, market_value_cad, book_value_cad, currency')
  const { data: manual } = await supabaseAdmin.from('manual_assets').select('owner, name, kind, value_cad')
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
  const { data: prof } = await supabaseAdmin.from('household_profile').select('data').order('updated_at', { ascending: false }).limit(1).maybeSingle()
  const profSections: any[] = prof?.data?.sections || []
  const profileText = profSections.length
    ? profSections.map((s) => `${s.icon || ''} ${s.title}:\n${(s.items || []).map((it: any) => `  - ${it.label}: ${it.value}`).join('\n')}`).join('\n\n')
    : ''

  const recent = [...txns]
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 25)
    .map((t: any) => `  - id=${t.id ?? '?'} · ${t.date} · ${t.type} · ${t.category ?? '—'} · ${t.description ?? '—'} · ${money(Number(t.amount))}`).join('\n')

  const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([c, v]) => `  - ${c}: ${money(v)}`).join('\n')
  const months = [...byMonth.entries()].sort().slice(-6)
    .map(([mo, v]) => `  - ${mo}: income ${money(v.i)}, expenses ${money(v.e)}, savings ${money(v.s)}`).join('\n')
  const budgetList = (budgetRows ?? []).map((b) => `  - id=${b.id} · ${b.category} · ${b.name} · ${money(Number(b.amount))}/mo`).join('\n')
  const recList = (recRows ?? []).map((r) => `  - id=${r.id} · ${r.type} · ${r.category} · ${r.name} · ${money(Number(r.amount))}`).join('\n')

  // investment holdings detail — so "what's in my TFSA" is answered, never acted on
  const byAcct = new Map<string, number>()
  const holdingLines = (holds ?? []).map((h) => {
    byAcct.set(h.account_type, (byAcct.get(h.account_type) || 0) + Number(h.market_value_cad))
    const cost = h.book_value_cad ? ` (cost ${money(Number(h.book_value_cad))})` : ''
    return `  - ${h.symbol} — ${h.account_type} · ${h.owner}: ${Number(h.quantity).toLocaleString()} units · ${money(Number(h.market_value_cad))}${cost}`
  }).join('\n')
  const acctSummary = [...byAcct.entries()].map(([a, v]) => `${a} ${money(v)}`).join(' · ')
  const manualLines = (manual ?? []).map((a: any) => `  - ${a.name}${a.kind ? ` (${a.kind})` : ''} · ${a.owner}: ${money(Number(a.value_cad))}`).join('\n')

  const nowD = new Date()
  const thisM = nowD.toLocaleString('en', { month: 'long', year: 'numeric' })
  const lastM = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })

  return `Today is ${nowD.toISOString().slice(0, 10)}. "This month" = ${thisM}; "last month" = ${lastM}. Use these exactly when the user says this/last month. The user is tracking their finances toward a ${money(goal)} goal ("Journey to 500K"). All amounts are in CAD.

⭐ THE GOAL METRIC IS NET WORTH, NOT the savings-contributions total. "Progress to the goal" = net worth ÷ goal. Do NOT use the "total saved/invested" figure below as progress toward the goal.

NET WORTH (current) = ${money(netWorth)}  →  ${Math.round((netWorth / goal) * 100)}% of the ${money(goal)} goal
- Investments (Wealthsimple holdings): ${money(holdingsValue)}
- Cash & other assets: ${money(cashValue)}
- Debts remaining (subtracted): ${money(debtsRemaining)}

INVESTMENT HOLDINGS (by account: ${acctSummary || 'none'}):
${holdingLines || '  (none)'}

CASH & OTHER ASSETS:
${manualLines || '  (none)'}

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
${recList || '  (none)'}

HOUSEHOLD PROFILE (KYC — members, home, insurance, estate, ground rules, goals):
${profileText || '  (not set up yet)'}`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---- Live market snapshot (free Yahoo Finance feed, same as "Refresh Prices") ----
const MKT_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36', accept: 'application/json', 'accept-language': 'en-US,en;q=0.9' }
const marketRe = /\b(market|markets|stock|stocks|portfolio|holding|holdings|invest|investment|index|indices|s&p|sp ?500|nasdaq|tsx|dow|share|shares|equit|etf|ticker|xeqt|xqq|msty|bitcoin|btc)\b/i

async function yQuote(ticker: string): Promise<{ price: number; prev: number; currency: string } | null> {
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const r = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`, { headers: MKT_HEADERS, cache: 'no-store' })
      if (!r.ok) continue
      const m = (await r.json())?.chart?.result?.[0]?.meta
      const price = m?.regularMarketPrice
      const prev = m?.previousClose ?? m?.chartPreviousClose
      if (typeof price === 'number' && typeof prev === 'number') return { price, prev, currency: m?.currency || 'USD' }
    } catch { /* try next host */ }
  }
  return null
}
const yTicker = (symbol: string, currency: string) => currency === 'USD' ? symbol : symbol.replace(/\./g, '-') + '.TO'

let mktCache: { at: number; text: string } | null = null
async function getMarketContext(): Promise<string> {
  if (mktCache && Date.now() - mktCache.at < 5 * 60 * 1000) return mktCache.text
  const pct = (p: number, prev: number) => (prev ? ((p - prev) / prev) * 100 : 0)
  const sign = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%'

  const indices: [string, string][] = [['S&P 500', '^GSPC'], ['Nasdaq', '^IXIC'], ['TSX Composite', '^GSPTSE']]
  const [idxQuotes, fx] = await Promise.all([Promise.all(indices.map(([, t]) => yQuote(t))), yQuote('CAD=X')])
  const idxLines = indices.map(([name], i) => { const q = idxQuotes[i]; return q ? `  - ${name}: ${sign(pct(q.price, q.prev))} today` : `  - ${name}: n/a` }).join('\n')
  const fxLine = fx ? `USD/CAD ${fx.price.toFixed(4)} (${sign(pct(fx.price, fx.prev))} today)` : ''

  const { data: holds } = await supabaseAdmin.from('holdings').select('symbol, currency, quantity, market_value_cad')
  const rows = holds ?? []
  const symbols = [...new Map(rows.map((h) => [h.symbol, h.currency])).entries()]
  const dayPct = new Map<string, number>()
  for (const [symbol, currency] of symbols) {
    if (symbol === 'BTC') continue
    const q = await yQuote(yTicker(symbol, currency))
    if (q) dayPct.set(symbol, pct(q.price, q.prev))
    await sleep(100)
  }
  let value = 0, change = 0
  const per = new Map<string, number>()
  for (const h of rows) {
    const mv = Number(h.market_value_cad) || 0
    value += mv
    const dp = dayPct.get(h.symbol) ?? 0
    change += (mv * dp) / 100
    per.set(h.symbol, dp)
  }
  const perLines = [...per.entries()].map(([s, dp]) => `  - ${s}: ${sign(dp)} today`).join('\n')

  const text = `\n\nLIVE MARKET (fetched moments ago):\nMajor indices today:\n${idxLines}\n${fxLine}\n\nUSER'S PORTFOLIO TODAY (live):\n- Total value: $${Math.round(value).toLocaleString()}\n- Estimated change today: ${change >= 0 ? '+' : '−'}$${Math.round(Math.abs(change)).toLocaleString()} (${sign(value ? (change / value) * 100 : 0)})\nPer-holding day change:\n${perLines}`
  mktCache = { at: Date.now(), text }
  return text
}

// Call Gemini with the tool set. Retries once on transient overload, then falls
// back through other free Flash models so a spike on one doesn't fail the request.
async function geminiGenerate({ system, contents }: { system: string; contents: any[] }) {
  const models = [GEMINI_MODEL, 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
    .filter((m, i, a) => m && a.indexOf(m) === i)
  let lastErr = ''
  for (const model of models) {
    // 2.0 Flash doesn't accept thinkingConfig; 2.5-class models get a modest
    // reasoning budget (better accuracy) with headroom so answers don't truncate
    const supportsThinking = !/2\.0/.test(model)
    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents,
      tools: TOOLS,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.4,
        ...(supportsThinking ? { thinkingConfig: { thinkingBudget: 1024 } } : {}),
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
    `You are the household's "Family CFO" for the "Journey to 500K" app — analytical, proactive, ` +
    `and specific to their numbers (no generic advice). Answer using ONLY the data below, including ` +
    `the HOUSEHOLD PROFILE. Use CAD ($). ANSWER THE USER'S ACTUAL QUESTION FIRST, concisely. You may ` +
    `proactively flag a genuinely relevant opportunity when the data clearly warrants it (e.g. an ` +
    `emergency-fund gap when there's little cash, a chance to save, or a notable opportunity cost) — ` +
    `but do NOT recite standing advice or a checklist in every reply, and don't repeat the same ` +
    `reminder you've given before. Give specific numbers and a clear next action.\n\n` +
    `⚠️ READ vs. WRITE — THIS IS CRITICAL. By default you are ANSWERING QUESTIONS, not changing data. ` +
    `If the user asks to view/check/see/show/tell/explain, or asks "what/how/why/can you/is it/should I", ` +
    `it is READ-ONLY: answer from the data below and DO NOT call any tool. ` +
    `Examples that are READ-ONLY (never call a tool): "check my TFSA holdings", "what's in my TFSA", ` +
    `"how am I doing", "should I buy X", "is this okay". "Check/see my prices or holdings" means SHOW me — ` +
    `do NOT refresh. Only call refresh_prices if the user explicitly says to refresh or update prices. ` +
    `\n\nONLY call a tool when the user gives an explicit COMMAND to change data using an action verb ` +
    `(add, log, record, create, edit, change, update, set, delete, remove, refresh). When unsure, ASK ` +
    `"want me to log that?" instead of acting. ` +
    `You CAN take these actions when clearly asked: adding/editing/deleting transactions, budget items, ` +
    `and recurring items; logging recurring items; changing the goal; refreshing prices. ` +
    `To edit/delete a transaction not in the recent list, FIRST call find_transactions, then act on its id. ` +
    `You MAY call several tools in one turn when the user asks for multiple changes (e.g. add three ` +
    `expenses) — they are confirmed together. To "log this/last month's recurring items", call ` +
    `log_recurring with the ids of the relevant ACTIVE RECURRING ITEMS. ` +
    `Use the exact category names listed; use the exact id from the data for any edit/delete/log. ` +
    `If the date is unspecified, use today's date. Never guess an id — if you can't find it, ask. ` +
    `The app will ask the user to confirm before changes are saved, so you don't need to ask for confirmation yourself.\n\n${context}`

  // Only pull live market data when the question is actually about markets/portfolio.
  let fullSystem = system
  if (marketRe.test(String(message))) {
    try { fullSystem += await getMarketContext() } catch { /* market feed optional */ }
  }

  const prior = Array.isArray(history) ? history : []
  const messages = [...prior, { role: 'user', content: message }]

  try {
    // ---- Free: Google Gemini (auto-retry + model fallback on overload) ----
    if (GEMINI_KEY) {
      const contents = messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content ?? '') }],
      }))
      const busyMsg = (err: string) => /UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED|503|429/i.test(err)
        ? 'The free AI is busy right now — please try again in a few seconds.'
        : 'AI error: ' + err.slice(0, 200)

      const r = await geminiGenerate({ system: fullSystem, contents })
      if (!r.ok) return NextResponse.json({ error: busyMsg(r.err) }, { status: 502 })
      let { calls, reply } = parseGemini(r.data)

      // If it needs to look up an older transaction, run the search and re-ask once
      // with the results in context (so it can then edit/delete by the real id).
      const find = calls.find((c: any) => c.name === 'find_transactions')
      if (find) {
        const results = await searchTransactions(find.args || {})
        const cad2 = (n: any) => '$' + (Number(n) || 0).toLocaleString()
        const block = results.length
          ? results.map((t: any) => `  - id=${t.id} · ${t.date} · ${t.type} · ${t.category ?? '—'} · ${t.description ?? '—'} · ${cad2(t.amount)}`).join('\n')
          : '  (no matching transactions found)'
        const r2 = await geminiGenerate({ system: `${fullSystem}\n\nSEARCH RESULTS (use these exact ids):\n${block}`, contents })
        if (r2.ok) ({ calls, reply } = parseGemini(r2.data))
      }

      // Any write actions → return for confirmation
      const writes = calls.filter((c: any) => c.name !== 'find_transactions')
      if (writes.length) {
        return NextResponse.json({ actions: writes.map((c: any) => ({ name: c.name, args: c.args || {}, label: describeAction(c.name, c.args || {}) })) })
      }
      return NextResponse.json({ reply: reply || 'Sorry, I could not generate a response.' })
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
        system: fullSystem,
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

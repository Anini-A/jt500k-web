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
    const { text, images, today } = await req.json().catch(() => ({}))
    const raw = String(text || '').trim()
    const imgs = (Array.isArray(images) ? images : []).filter((i: any) => i?.data).slice(0, 8)
    if (!raw && !imgs.length) return NextResponse.json({ error: 'Nothing to parse.' }, { status: 400 })

    const { data: cats } = await supabaseAdmin.from('categories').select('name, type')
    const catList = (cats ?? [])
    const expenseCats = catList.filter((c) => c.type === 'expense').map((c) => c.name)
    const typeByName = new Map(catList.map((c) => [c.name.toLowerCase(), c.type]))
    const validNames = catList.map((c) => c.name)

    const todayStr = /^\d{4}-\d{2}-\d{2}$/.test(String(today)) ? today : new Date().toISOString().slice(0, 10)
    const weekday = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long' })

    const system =
      `You extract transactions (both INCOME and EXPENSES) from a bank or credit-card statement — provided as pasted text and/or SCREENSHOTS — into JSON. ` +
      `Return ONLY a JSON array; each element: {"date":"YYYY-MM-DD","description":string,"category":string,"amount":number}. ` +
      `Rules:\n` +
      `- One element per real transaction. INCLUDE both pending and posted. ` +
      `SKIP non-transaction lines: totals ("Total", "Grand Total"), card/account names & headers (e.g. "Wealthsimple credit card"), ` +
      `"Purchase"/"Deposit"/"Pending"/"Posted transactions" labels, balances, credit limits, currency codes, times.\n` +
      `- SKIP transfers between the person's OWN accounts and credit-card payments — they are NOT income or expenses. ` +
      `E.g. "PAYMENT - THANK YOU", "PYMT", "BILL PAYMENT ... VISA/MASTERCARD", "TRANSFER TO/FROM", "e-Transfer to self".\n` +
      `- amount = a POSITIVE number always. Strip $, commas, currency codes (CAD/USD), and any +/− sign. "− $52.95 CAD" → 52.95.\n` +
      `- DIRECTION → pick the right category. Money OUT (a purchase, withdrawal, fee, debit, a "−" on a card) → an EXPENSE category. ` +
      `Money IN (a deposit/credit/"+" on a bank account) → the matching INCOME category by description: ` +
      `payroll/salary/direct deposit/"PAY" → "Paycheck"; CRA/"Canada"/child benefit/CCB/carbon rebate/climate/GST/HST credit/EI → "Gov Benefits"; ` +
      `a store/merchant refund or reversal → "Refund"; freelance/side gig → "Side Hustle". ` +
      `A deposit into TFSA/RRSP/savings → the closest SAVINGS category if one exists. ` +
      `(On a CREDIT-CARD statement a credit is usually a refund → "Refund"; a card payment → SKIP per above.)\n` +
      `- description = the clean merchant/payer name (e.g. "Walmart Store #3107", "Canada Child Benefit").\n` +
      `- date: TODAY is ${todayStr} (${weekday}). Output an absolute YYYY-MM-DD. Resolve relative dates: ` +
      `"Today"→${todayStr}; "Yesterday"→the day before; "N days ago"→count back; a weekday name→its most recent PAST occurrence; ` +
      `"Aug 5" with no year→assume ${todayStr.slice(0, 4)} (but never a future date — use last year if that would be in the future). ` +
      `A date LINE that has no amount (e.g. "Yesterday", "August 5", "Mon") is a HEADER: apply it to every transaction listed below it until the next date header. ` +
      `If a transaction has its own date/time, use that instead.\n` +
      `- category = the SINGLE best match from this EXACT list (use these strings verbatim): ${validNames.join(', ')}.\n` +
      `  Map bank categories to the closest one, e.g. "Food & groceries"→"Food", "Restaurants & bars"→"Food", ` +
      `"Transportation & car"/"Gas"→"Transportation", "Shopping"→"Personal", "Home"→"Housing"; ` +
      `by merchant when there's no bank category, e.g. Winners/Value Village→"Clothing", Walmart/Dollarama→"Misc". ` +
      `If unsure, pick the most likely expense category (default "Misc" if it exists). Never invent a category outside the list.\n` +
      `Return [] if there are no transactions.`

    const userParts: any[] = []
    for (const im of imgs) userParts.push({ inlineData: { mimeType: im.mime || 'image/jpeg', data: im.data } })
    if (raw) userParts.push({ text: raw })
    else if (imgs.length) userParts.push({ text: 'Extract every transaction visible in the screenshot(s).' })

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: userParts }],
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

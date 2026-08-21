// Estimate net-worth history for the months BEFORE real data exists.
// Cash & debts are reconstructed from real transactions; only the investment
// growth is estimated — using REAL monthly index returns — and the whole thing
// is anchored to the earliest real value so it converges to the truth there.

const MKT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  accept: 'application/json', 'accept-language': 'en-US,en;q=0.9',
}

const addMonth = (m: string, k: number) => { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }
const monthsApart = (a: string, b: string) => { const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number); return (yb * 12 + mb) - (ya * 12 + ma) }

// month-over-month returns for a broad equity index, keyed 'YYYY-MM' (return INTO that month)
let idxCache: { at: number; map: Map<string, number> } | null = null
export async function indexMonthlyReturns(): Promise<Map<string, number>> {
  if (idxCache && Date.now() - idxCache.at < 12 * 60 * 60 * 1000) return idxCache.map
  for (const ticker of ['XEQT.TO', '%5EGSPC']) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1mo&range=6y&includeAdjustedClose=true`
      const r = await fetch(url, { headers: MKT_HEADERS, cache: 'no-store' })
      if (!r.ok) continue
      const res = (await r.json())?.chart?.result?.[0]
      const ts: number[] = res?.timestamp || []
      const adj: (number | null)[] = res?.indicators?.adjclose?.[0]?.adjclose || res?.indicators?.quote?.[0]?.close || []
      if (ts.length < 3) continue
      const closes: { m: string; c: number }[] = []
      for (let i = 0; i < ts.length; i++) {
        const c = adj[i]; if (typeof c !== 'number') continue
        closes.push({ m: new Date(ts[i] * 1000).toISOString().slice(0, 7), c })
      }
      const map = new Map<string, number>()
      for (let i = 1; i < closes.length; i++) map.set(closes[i].m, closes[i].c / closes[i - 1].c - 1)
      if (map.size) { idxCache = { at: Date.now(), map }; return map }
    } catch { /* try next ticker */ }
  }
  return new Map() // callers fall back to a flat rate
}

export interface MonthlyFlow { income: number; expense: number; savings: number; debtRepay: number }

// Walk backward from the anchor (earliest real month) to `startMonth`, returning
// estimated { month, net, est:true } points for every month strictly before the anchor.
export function reconstructHistory(opts: {
  startMonth: string
  anchorMonth: string
  anchorHoldings: number  // investment market value at the anchor
  anchorCash: number
  anchorDebts: number     // debts remaining at the anchor
  flows: Map<string, MonthlyFlow>
  idxReturns: Map<string, number>
  fallbackAnnualRate?: number
}): { month: string; net: number; est: true }[] {
  const { startMonth, anchorMonth, anchorHoldings, anchorCash, anchorDebts, flows, idxReturns } = opts
  const flatMonthly = Math.pow(1 + (opts.fallbackAnnualRate ?? 0.07), 1 / 12) - 1
  const gap = monthsApart(startMonth, anchorMonth)
  if (gap <= 0) return []

  let holdings = anchorHoldings, cash = anchorCash, debts = anchorDebts
  const out: { month: string; net: number; est: true }[] = []
  // step from the anchor back to startMonth, undoing each month's flows + market move
  for (let m = anchorMonth; m > startMonth; m = addMonth(m, -1)) {
    const f = flows.get(m) || { income: 0, expense: 0, savings: 0, debtRepay: 0 }
    const ret = idxReturns.has(m) ? (idxReturns.get(m) as number) : flatMonthly
    // undo this month → values at the previous month
    holdings = Math.max(0, (holdings - f.savings) / (1 + ret))
    cash = cash - (f.income - f.expense - f.savings)
    debts = Math.max(0, debts + f.debtRepay)
    const prev = addMonth(m, -1)
    out.push({ month: prev, net: Math.round(holdings + cash - debts), est: true })
  }
  return out.reverse() // chronological
}

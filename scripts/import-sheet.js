/*
 * Import your "Journey To 500K" Google Sheet into Supabase.
 *
 * 1. In Google Sheets: File → Download → Comma-separated values (.csv)
 * 2. Save the file into this project folder as:  journey-to-500k.csv
 * 3. Run:  node scripts/import-sheet.js
 *
 * Safe to re-run — it clears existing data and reloads from the CSV.
 */
const fs = require('fs')
const path = require('path')

// --- load .env.local ---
const envPath = path.join(__dirname, '..', '.env.local')
fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
})

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// --- category → type + display color ---
const CATEGORY_TYPE = {
  // income
  Paycheck: 'income', Refund: 'income', 'Side Hustle': 'income',
  // savings
  'HF Saving': 'savings', 'JA Saving': 'savings', 'AN Saving': 'savings',
  'Emergency fund': 'savings', 'Vacation Saving': 'savings',
  // expense
  Housing: 'expense', Food: 'expense', Utilities: 'expense', Transpo: 'expense',
  Health: 'expense', 'Baby Exp': 'expense', Gifts: 'expense', Subs: 'expense',
  'HF Fun M': 'expense', 'JA Fun M': 'expense', Perso: 'expense', Misc: 'expense',
  Edu: 'expense', Clothing: 'expense', Entmt: 'expense', Emergency: 'expense',
}
const COLORS = { income: '#1baf7a', expense: '#eb6834', savings: '#6366f1' }

// --- tiny CSV parser (handles quoted fields with commas) ---
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

function parseAmount(raw) {
  if (!raw) return NaN
  return parseFloat(String(raw).replace(/[^0-9.\-]/g, ''))
}

async function main() {
  const csvPath = path.join(__dirname, '..', 'journey-to-500k.csv')
  if (!fs.existsSync(csvPath)) {
    console.error('❌ Could not find journey-to-500k.csv in the project folder.')
    console.error('   In Google Sheets: File → Download → CSV, save it there, then re-run.')
    process.exit(1)
  }

  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'))
  // find header row (contains Date + Category + Amount)
  const headerIdx = rows.findIndex((r) =>
    r.map((c) => c.trim().toLowerCase()).includes('category'))
  if (headerIdx === -1) { console.error('❌ No header row with "Category" found.'); process.exit(1) }
  const header = rows[headerIdx].map((c) => c.trim().toLowerCase())
  const col = (name) => header.indexOf(name)
  const iDate = col('date'), iDesc = col('description'), iCat = col('category'), iAmt = col('amount')

  const parsed = []
  const unknown = new Set()
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const date = (row[iDate] || '').trim()
    const category = (row[iCat] || '').trim()
    const amount = parseAmount(row[iAmt])
    if (!date || !category || !amount || isNaN(amount)) continue // skip blanks / "Starting balance"
    const type = CATEGORY_TYPE[category]
    if (!type) { unknown.add(category); continue }
    parsed.push({
      date, category, amount, type,
      description: (row[iDesc] || '').trim() || null,
    })
  }

  if (unknown.size) {
    console.warn('⚠️  Skipped rows with unrecognised categories:', [...unknown].join(', '))
    console.warn('    (add them to CATEGORY_TYPE in this script and re-run to include them)')
  }
  console.log(`Parsed ${parsed.length} valid transactions.`)

  // --- wipe + recreate ---
  console.log('Clearing existing data...')
  await sb.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await sb.from('categories').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await sb.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await sb.from('households').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const { data: household, error: hErr } = await sb
    .from('households').insert({ name: 'My Household' }).select().single()
  if (hErr) { console.error('Household error:', hErr.message); process.exit(1) }
  console.log('✅ Household created')

  await sb.from('users').insert({ household_id: household.id, name: 'You', email: process.env.OWNER_EMAIL || null })

  // categories from the type map
  const catRows = Object.entries(CATEGORY_TYPE).map(([name, type]) => ({
    household_id: household.id, name, type, color: COLORS[type],
  }))
  const { data: cats, error: cErr } = await sb.from('categories').insert(catRows).select()
  if (cErr) { console.error('Category error:', cErr.message); process.exit(1) }
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]))
  console.log(`✅ ${cats.length} categories created`)

  // transactions in batches
  const txRows = parsed.map((t) => ({
    household_id: household.id,
    category_id: catId[t.category] || null,
    date: t.date, description: t.description, category: t.category,
    type: t.type, amount: t.amount,
  }))
  let inserted = 0
  for (let i = 0; i < txRows.length; i += 200) {
    const batch = txRows.slice(i, i + 200)
    const { error } = await sb.from('transactions').insert(batch)
    if (error) { console.error('Transaction batch error:', error.message); process.exit(1) }
    inserted += batch.length
    process.stdout.write(`\r  inserted ${inserted}/${txRows.length}`)
  }
  console.log('\n✅ Import complete!')

  // quick summary
  const totals = { income: 0, expense: 0, savings: 0 }
  parsed.forEach((t) => { totals[t.type] += t.amount })
  console.log(`   Income:   $${totals.income.toLocaleString()}`)
  console.log(`   Expenses: $${totals.expense.toLocaleString()}`)
  console.log(`   Savings:  $${totals.savings.toLocaleString()}`)
}

main().catch((e) => { console.error(e); process.exit(1) })

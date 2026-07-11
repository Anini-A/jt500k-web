/*
 * One-time backfill: split debt payments out of Utilities into a new
 * "Debt Repayment" category (type = expense).
 *
 *   - description contains "loan"   -> category "Debt Repayment", desc "HF RBC debt repayment"
 *   - description contains "margin" -> category "Debt Repayment", desc "Margin account payment"
 *
 * Run:  node scripts/backfill-debt.js
 * Safe to re-run (idempotent — renamed rows no longer match "loan").
 *
 * NOTE: this only changes the database. If you ever re-import from the Google
 * Sheet, these rows revert to Utilities (re-run this script to fix).
 */
const fs = require('fs')
const path = require('path')
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
})
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const CATEGORY = 'Debt Repayment'

async function main() {
  const { data: household } = await sb.from('households').select('id').order('created_at').limit(1).maybeSingle()
  if (!household) { console.error('No household found.'); process.exit(1) }

  // 1) ensure the category exists
  let { data: cat } = await sb.from('categories').select('id').eq('household_id', household.id).eq('name', CATEGORY).maybeSingle()
  if (!cat) {
    const { data: created, error } = await sb.from('categories')
      .insert({ household_id: household.id, name: CATEGORY, type: 'expense', color: '#eb6834' })
      .select().single()
    if (error) { console.error('Category error:', error.message); process.exit(1) }
    cat = created
    console.log(`✅ Created category "${CATEGORY}"`)
  } else {
    console.log(`ℹ️  Category "${CATEGORY}" already exists`)
  }

  // preview before
  const { data: loanRows } = await sb.from('transactions').select('id, amount').ilike('description', '%loan%')
  const { data: marginRows } = await sb.from('transactions').select('id, amount').ilike('description', '%margin%')
  const sum = (a) => (a || []).reduce((s, t) => s + Number(t.amount), 0)
  console.log(`\nMatched ${loanRows?.length || 0} loan rows ($${Math.round(sum(loanRows)).toLocaleString()}) and ${marginRows?.length || 0} margin rows ($${Math.round(sum(marginRows)).toLocaleString()})`)

  // 2) reclassify loan rows
  if (loanRows?.length) {
    const { error } = await sb.from('transactions')
      .update({ category: CATEGORY, category_id: cat.id, type: 'expense', description: 'HF RBC debt repayment' })
      .ilike('description', '%loan%')
    if (error) { console.error('Loan update error:', error.message); process.exit(1) }
    console.log(`✅ Reclassified ${loanRows.length} loan rows → "${CATEGORY}" / "HF RBC debt repayment"`)
  }

  // 3) reclassify margin rows (keep their description)
  if (marginRows?.length) {
    const { error } = await sb.from('transactions')
      .update({ category: CATEGORY, category_id: cat.id, type: 'expense', description: 'Margin account payment' })
      .ilike('description', '%margin%')
    if (error) { console.error('Margin update error:', error.message); process.exit(1) }
    console.log(`✅ Reclassified ${marginRows.length} margin rows → "${CATEGORY}" / "Margin account payment"`)
  }

  // report totals
  const { data: debt } = await sb.from('transactions').select('amount, description').eq('category', CATEGORY)
  const rbc = (debt || []).filter((t) => t.description === 'HF RBC debt repayment')
  const mgn = (debt || []).filter((t) => t.description === 'Margin account payment')
  const { data: util } = await sb.from('transactions').select('amount').eq('category', 'Utilities')
  console.log(`\n=== After ===`)
  console.log(`Debt Repayment total: $${Math.round(sum(debt)).toLocaleString()} (${debt?.length || 0} rows)`)
  console.log(`  • HF RBC debt repayment:  $${Math.round(sum(rbc)).toLocaleString()} (${rbc.length} rows)`)
  console.log(`  • Margin account payment: $${Math.round(sum(mgn)).toLocaleString()} (${mgn.length} rows)`)
  console.log(`Utilities now: $${Math.round(sum(util)).toLocaleString()} (${util?.length || 0} rows)`)
  console.log('\n✅ Done.')
}

main().catch((e) => { console.error(e); process.exit(1) })

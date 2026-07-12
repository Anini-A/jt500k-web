/*
 * Full backup of the JT500K database to a dated JSON file.
 * Run:  node scripts/backup.js        (writes ./backups/jt500k-backup-YYYY-MM-DD.json)
 */
const fs = require('fs')
const path = require('path')
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
})
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TABLES = ['households', 'users', 'categories', 'transactions', 'budgets', 'debts', 'holdings']

async function main() {
  const out = { app: 'jt500k', version: 1, exportedAt: new Date().toISOString(), counts: {} }
  for (const t of TABLES) {
    const { data, error } = await sb.from(t).select('*')
    if (error) { console.error(t, error.message); process.exit(1) }
    out[t] = data || []
    out.counts[t] = (data || []).length
  }
  const dir = path.join(__dirname, '..', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `jt500k-backup-${new Date().toISOString().slice(0, 10)}.json`)
  fs.writeFileSync(file, JSON.stringify(out))
  console.log('✅ Backup written:', file)
  console.log('   ', Object.entries(out.counts).map(([k, v]) => `${k}:${v}`).join(' · '))
  console.log('   size:', (fs.statSync(file).size / 1024).toFixed(0) + ' KB')
}
main().catch((e) => { console.error(e); process.exit(1) })

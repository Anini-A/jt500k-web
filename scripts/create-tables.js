/*
 * Create the database tables by running supabase-schema.sql directly over
 * the Postgres connection — no SQL Editor needed.
 *
 * Requires DATABASE_URL in .env.local (Supabase → Project Settings → Database
 * → Connection string → URI). Run:  node scripts/create-tables.js
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
})

const { Client } = require('pg')

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in .env.local')
    console.error('   Add it from: Supabase → Project Settings → Database → Connection string (URI)')
    process.exit(1)
  }

  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase-schema.sql'), 'utf8')
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  console.log('Connected. Creating tables…')
  await client.query(sql)
  console.log('✅ Tables created successfully.')
  await client.end()
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1) })

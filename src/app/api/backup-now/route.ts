import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0
export const maxDuration = 30

// POST /api/backup-now — asks the deployed Google Apps Script web app to run a
// backup into your Drive (server-to-server, so no CORS / no Drive creds here).
export async function POST() {
  const url = process.env.GDRIVE_WEBAPP_URL
  const token = process.env.BACKUP_TOKEN
  if (!url || !token) {
    return NextResponse.json({ error: 'Drive backup isn’t configured yet — add GDRIVE_WEBAPP_URL and BACKUP_TOKEN in Vercel.' }, { status: 400 })
  }
  try {
    const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, { method: 'GET', redirect: 'follow', cache: 'no-store' })
    const text = await res.text()
    let data: any = null
    try { data = JSON.parse(text) } catch { /* Apps Script may return HTML on error */ }
    if (!res.ok || !data?.ok) {
      return NextResponse.json({ error: data?.error || `Apps Script returned ${res.status}` }, { status: 502 })
    }
    return NextResponse.json({ ok: true, file: data.file || null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Could not reach the backup script.' }, { status: 502 })
  }
}

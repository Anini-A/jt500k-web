import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, sitePassword, tokenFor } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/auth  { password }  → sets the auth cookie if correct.
export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }))
  const expected = sitePassword()

  if (!expected) {
    // No password configured → gate is effectively disabled.
    return NextResponse.json({ ok: true, disabled: true })
  }
  if (typeof password !== 'string' || password !== expected) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const token = await tokenFor(expected)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year — "remembered on this device"
  })
  return res
}

// DELETE /api/auth  → sign out
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}

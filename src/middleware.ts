import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, sitePassword, tokenFor } from '@/lib/auth'

// Protect the whole site behind a single shared password.
// If SITE_PASSWORD is not set, the gate is disabled (site stays open).
export async function middleware(req: NextRequest) {
  const pw = sitePassword()
  if (!pw) return NextResponse.next() // gate disabled

  const { pathname } = req.nextUrl

  // Always allow the login page and the auth endpoint.
  if (pathname === '/login' || pathname === '/api/auth' || pathname === '/api/debug') {
    return NextResponse.next()
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value
  const expected = await tokenFor(pw)
  if (cookie === expected) return NextResponse.next()

  // API calls get a 401; page requests get redirected to /login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
}

// Shared-password gate helpers. Works in both Node and Edge (middleware)
// runtimes via the Web Crypto API.

const SALT = 'jt500k::v1'

export function sitePassword(): string {
  return process.env.SITE_PASSWORD || ''
}

// Deterministic session token derived from the password, so middleware can
// validate the cookie without a database lookup.
export async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + ':' + password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const AUTH_COOKIE = 'jt_auth'

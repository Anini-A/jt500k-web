/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Vercel sets VERCEL_GIT_COMMIT_SHA at build time; falls back to 'local'
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  // Never let the browser/CDN cache page documents or API responses, so every
  // visit loads the latest code and live data. (Hashed /_next/static assets are
  // untouched and keep their normal long-term caching.)
  async headers() {
    const noStore = [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }]
    return [
      { source: '/', headers: noStore },
      { source: '/dashboard', headers: noStore },
      { source: '/transactions', headers: noStore },
      { source: '/settings', headers: noStore },
      { source: '/login', headers: noStore },
      { source: '/api/:path*', headers: noStore },
    ]
  },
}
module.exports = nextConfig

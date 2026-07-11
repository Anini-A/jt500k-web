/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Vercel sets VERCEL_GIT_COMMIT_SHA at build time; falls back to 'local'
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
}
module.exports = nextConfig

import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#1baf7a"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><path d="M15 42 L27 31 L36 37 L49 21" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="49" cy="21" r="4.5" fill="#ffffff"/></svg>`

// iOS uses a PNG apple-touch-icon; render the logo SVG to a 180×180 PNG.
export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width={180} height={180} src={src} alt="" />
      </div>
    ),
    size,
  )
}

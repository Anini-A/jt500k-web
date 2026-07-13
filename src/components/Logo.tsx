// Small brand mark — a rising trend line in a gradient tile. Matches the favicon.
export default function Logo({ size = 26 }: { size?: number }) {
  const id = 'lg' + size
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#1baf7a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <path d="M15 42 L27 31 L36 37 L49 21" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="49" cy="21" r="4.5" fill="#ffffff" />
    </svg>
  )
}

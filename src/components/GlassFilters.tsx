// Real refraction — the background actually bending near the glass edge — needs an
// SVG displacement map; `backdrop-filter: blur()` alone can only soften, never warp.
// Rendered once, globally, at zero size: `.glass` references it by id from
// `--blur-refract` in globals.css. Chromium supports an SVG filter reference inside
// `backdrop-filter`; Safari/Firefox reject that value outright, so globals.css gates
// it behind `@supports` and those browsers keep the plain blur instead.
export default function GlassFilters() {
  return (
    <svg aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <filter id="glass-distort" x="-20%" y="-20%" width="140%" height="140%">
        {/* Low frequency + few octaves: a gentle wave across the surface, not
           high-frequency noise that would swim under real content behind it. */}
        <feTurbulence type="fractalNoise" baseFrequency="0.010 0.014" numOctaves="2" seed="7" result="noise" />
        {/* Blur the noise field itself so the displacement is a smooth lens warp
           rather than a jittery ripple. */}
        <feGaussianBlur in="noise" stdDeviation="6" result="smoothNoise" />
        <feDisplacementMap in="SourceGraphic" in2="smoothNoise" scale="16" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

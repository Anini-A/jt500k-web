import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Journey to 500K',
    short_name: 'Journey 500K',
    description: 'Household net-worth tracker on the road to $500K.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // matches --page-plane, so the splash and status-bar tint sit on the app's own ground
    background_color: '#f4f4f3',
    theme_color: '#f4f4f3',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}

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
    // matched to the top of the aurora so the iOS status-bar band blends into the app
    background_color: '#e9e7f1',
    theme_color: '#e9e7f1',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}

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
    // white to match iOS's white status bar; the app's top fades from white into the aurora
    background_color: '#f9f9f7',
    theme_color: '#f9f9f7',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}

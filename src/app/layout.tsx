import type { Metadata, Viewport } from 'next'
import { Manrope } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import BottomNav from '@/components/BottomNav'
import PullToRefresh from '@/components/PullToRefresh'
import AddTransactionButton from '@/components/AddTransactionButton'
import CapacitorInit from '@/components/CapacitorInit'
import SwipePageNav from '@/components/SwipePageNav'
import './globals.css'

// Geometric grotesque in the same family of shapes as the Wealthsimple brand sans,
// picked for its figures: the 1 and 7 stay distinct at 11px, which is the size most of
// this app's numbers are set at. Paired with tabular figures in globals.css.
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Journey to 500K',
  description: 'Household net-worth tracker on the road to $500K.',
  manifest: '/manifest.webmanifest',
  // translucent status bar → the app fills the full screen, content flows under the status bar
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Journey 500K' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f3' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0f10' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <PullToRefresh />
        <SwipePageNav />
        {children}
        {/* headless — receives app-wide open events (Home 'to log' card, long-press Settings) */}
        <AddTransactionButton trigger={false} />
        <BottomNav />
        <CapacitorInit />
        <Analytics />
      </body>
    </html>
  )
}

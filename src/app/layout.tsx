import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import ChatFab from '@/components/ChatFab'
import './globals.css'

// Close free match to Wealthsimple's brand sans — warm geometric grotesque.
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Journey to 500K',
  description: 'Household net-worth tracker on the road to $500K.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Journey 500K' },
}

export const viewport: Viewport = {
  themeColor: '#1baf7a',
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
    <html lang="en" className={hanken.variable}>
      <body>
        {children}
        <ChatFab />
        <Analytics />
      </body>
    </html>
  )
}

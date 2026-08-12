'use client'

import { useEffect } from 'react'

// Runs only inside the native (Capacitor) shell — makes the status bar edge-to-edge
// with the right glyph colour, and hides the splash once the app has loaded.
export default function CapacitorInit() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!cap?.isNativePlatform?.()) return

    let cleanup: (() => void) | undefined
    ;(async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        await StatusBar.setOverlaysWebView({ overlay: true }) // content flows under the status bar
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const apply = () => StatusBar.setStyle({ style: mq.matches ? Style.Light : Style.Dark }).catch(() => {})
        apply()
        mq.addEventListener('change', apply)
        cleanup = () => mq.removeEventListener('change', apply)
      } catch { /* status-bar plugin unavailable */ }
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide()
      } catch { /* splash plugin unavailable */ }
    })()

    return () => cleanup?.()
  }, [])

  return null
}

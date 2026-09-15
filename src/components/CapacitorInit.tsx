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
        // iOS draws its own bar above the keyboard (the ∧ ∨ ✓ strip) for any focused web
        // input. Nothing in the page can remove it — but inside the native shell the
        // keyboard plugin can, which puts the composer right against the keys the way a
        // native app does. No effect in Safari or the home-screen PWA.
        const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard')
        await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {})
        // 'Native' resizes the WKWebView's own frame to the space above the keyboard —
        // but on dismiss it doesn't reliably restore the frame to full height, leaving a
        // blank gap at the bottom of every sheet (matching the page's own background)
        // until something else forces a reflow. 'Body' resizes the CSS body element
        // instead, which restores correctly and is what our dvh-based layout expects.
        await Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => {})
        await Keyboard.setScroll({ isDisabled: true }).catch(() => {}) // the sheet handles its own sizing
      } catch { /* keyboard plugin unavailable */ }
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide()
      } catch { /* splash plugin unavailable */ }
    })()

    return () => cleanup?.()
  }, [])

  return null
}

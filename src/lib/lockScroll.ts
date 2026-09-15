'use client'

import { useEffect } from 'react'

// Hold the page still while a sheet is open.
//
// overflow:hidden alone doesn't do it on iOS — Safari scrolls the document behind a
// fixed overlay anyway, so the page drifts under your finger whenever the sheet's own
// content has nothing left to scroll. Pinning the body with position:fixed is the only
// reliable stop; the saved offset goes back on afterwards so closing the sheet doesn't
// jump you to the top.
//
// Nested sheets (a modal opened from a modal) share one lock: the counter means the
// inner one closing doesn't unpin the page while the outer is still up.
let depth = 0
let savedY = 0

export function useLockScroll(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (depth === 0) {
      savedY = window.scrollY || document.documentElement.scrollTop || 0
      const { style } = document.body
      style.position = 'fixed'
      style.top = `-${savedY}px`
      style.left = '0'
      style.right = '0'
      style.width = '100%'
      // Without an explicit height, a fixed body sizes to its own (static) content —
      // usually taller than one screen, but not always. Any fixed-position descendant
      // (a modal backdrop portaled onto document.body) then gets clipped to that
      // shorter box by the overflow:hidden below, leaving a blank gap at the bottom
      // of the viewport instead of the backdrop reaching all the way down.
      style.height = '100dvh'
      style.overflow = 'hidden'
    }
    depth += 1
    return () => {
      depth -= 1
      if (depth > 0) return
      const { style } = document.body
      style.position = ''
      style.top = ''
      style.left = ''
      style.right = ''
      style.width = ''
      style.height = ''
      style.overflow = ''
      window.scrollTo(0, savedY)
    }
  }, [active])
}

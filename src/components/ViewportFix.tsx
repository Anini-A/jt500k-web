'use client'

import { useEffect } from 'react'

// iOS Safari (especially the installed/standalone PWA) has a long-standing bug: once
// the on-screen keyboard has shown and hidden, `vh`/`dvh`-based layout viewport values
// can get stuck at the shrunk (keyboard-visible) size instead of settling back to the
// real screen height — fixed-position elements (like a modal's backdrop) then fall
// short of the actual bottom edge, leaving a blank gap painted with the page background.
//
// `window.visualViewport.height` is always correct, so we mirror it into a CSS custom
// property on every resize and let layout consume that instead of relying solely on
// vh/dvh. We also nudge the engine with a scroll + forced reflow after the keyboard
// closes, which is the standard workaround for WebKit not repainting fixed elements on
// its own once the stuck viewport value is corrected.
export default function ViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport
    const setVar = () => {
      const h = vv?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--vvh', `${h}px`)
    }
    setVar()

    let hideTimer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      setVar()
      // debounce a follow-up nudge — catches the keyboard-just-closed case, where the
      // viewport settles a moment after this event fires
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = setTimeout(() => {
        setVar()
        // force a reflow so WebKit re-measures fixed-position descendants against the
        // corrected viewport instead of leaving them painted at the stale size
        void document.body.offsetHeight
      }, 120)
    }

    vv?.addEventListener('resize', onResize)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      vv?.removeEventListener('resize', onResize)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [])

  return null
}

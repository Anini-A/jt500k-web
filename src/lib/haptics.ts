'use client'

// Real haptic feedback — native (Capacitor) shell only. iOS Safari, and the
// home-screen PWA installed from it, has no Vibration API at all (Apple has never
// shipped one in WebKit), so every call here is a silent no-op outside the wrapped
// app rather than something that needs its own feature check at each call site.
type HapticsModule = typeof import('@capacitor/haptics')
let mod: HapticsModule | null | undefined // undefined = not checked yet, null = unavailable

async function load(): Promise<HapticsModule | null> {
  if (mod !== undefined) return mod
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (!cap?.isNativePlatform?.()) { mod = null; return null }
  try { mod = await import('@capacitor/haptics') } catch { mod = null }
  return mod
}

// A light tick for an ordinary tap — icon buttons, add/save actions.
export async function hapticTap() {
  const h = await load(); if (!h) return
  h.Haptics.impact({ style: h.ImpactStyle.Light }).catch(() => {})
}

// The "clicked into place" feel for moving through a set of options — tab
// switches, a swipe committing to the next section, a picker settling.
export async function hapticSelect() {
  const h = await load(); if (!h) return
  h.Haptics.selectionChanged().catch(() => {})
}

// A save/add that succeeded.
export async function hapticSuccess() {
  const h = await load(); if (!h) return
  h.Haptics.notification({ type: h.NotificationType.Success }).catch(() => {})
}

// A destructive confirmation (delete) or something that needs a second look.
export async function hapticWarning() {
  const h = await load(); if (!h) return
  h.Haptics.notification({ type: h.NotificationType.Warning }).catch(() => {})
}

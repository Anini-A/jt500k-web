'use client'

import { useEffect, useState } from 'react'

// Feature-detect a CSS declaration at runtime. Always false on the first render:
// the server can't know the answer, so assuming support would mismatch during
// hydration. Callers use it to drop a JS fallback once the browser can do it natively.
export function useCssSupports(prop: string, value: string) {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    try { setOk(CSS.supports(prop, value)) } catch { /* old browser */ }
  }, [prop, value])
  return ok
}

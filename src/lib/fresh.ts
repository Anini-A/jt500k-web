// Cache-buster: append a unique timestamp so the browser/CDN can never serve a
// stale cached copy of a data response. Use together with { cache: 'no-store' }.
export const fresh = (url: string) =>
  `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`

// Local stale-while-revalidate cache: the last good response for a URL is kept in
// localStorage so the app can paint instantly on a cold/offline open, then refresh.
const cacheKey = (url: string) => 'jtcache:' + url.split('?')[0]

// Synchronously read the last cached value for a URL (for useState initializers).
// Returns null on miss, on the server, or if storage is unavailable.
export function cachedValue<T = any>(url: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(cacheKey(url))
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

// Fetch fresh JSON and cache any successful (non-error) response.
export const getJSON = (url: string) =>
  fetch(fresh(url), { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => {
      if (d && !d.error && typeof window !== 'undefined') {
        try { localStorage.setItem(cacheKey(url), JSON.stringify(d)) } catch { /* quota/full — ignore */ }
      }
      return d
    })

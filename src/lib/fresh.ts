// Cache-buster: append a unique timestamp so the browser/CDN can never serve a
// stale cached copy of a data response. Use together with { cache: 'no-store' }.
export const fresh = (url: string) =>
  `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`

export const getJSON = (url: string) =>
  fetch(fresh(url), { cache: 'no-store' }).then((r) => r.json())

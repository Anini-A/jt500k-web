// Local-date helpers — always resolve to the VIEWER's timezone (their Mac/phone),
// never UTC. Using `toISOString()` for "today" is a bug: it shifts to the next day
// in the evening for negative-offset zones like Winnipeg (Central).

// YYYY-MM-DD for a given date (defaults to now), in the local timezone.
export const ymd = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Today's date (local), YYYY-MM-DD.
export const today = () => ymd()

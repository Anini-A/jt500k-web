// The money lanes, and the tints built on them — one definition, imported everywhere.
//
// These used to be written out per component. That is how Spending ended up set to
// var(--savings) in BOTH the budget groups and the recurring groups, so Spending and
// Saving rendered the same indigo in two different screens; and how a dozen chips
// ended up putting a lane colour on that lane's own -soft fill, which lands around
// 2.3-2.6:1 and fails contrast at pill sizes. Neither can recur from here: a lane is
// named once, and tint() is the only way to build the pair.

export type Tint = { fg: string; bg: string }

/** A token's readable text tone over its own soft fill. Never pair -soft with the
 *  plain lane colour: that is the combination that fails contrast. */
export const tint = (token: string): Tint => ({
  fg: `var(--${token}-ink)`,
  bg: `var(--${token}-soft)`,
})

/** A neutral tint for anything that has no lane of its own. */
export const NEUTRAL_TINT: Tint = { fg: 'var(--text-secondary)', bg: 'var(--kpi-bg)' }

export type LaneKey = 'income' | 'spending' | 'saving' | 'debt'

export type Lane = {
  key: LaneKey
  label: string
  /** the CSS custom-property stem: --<token>, --<token>-soft, --<token>-ink */
  token: string
} & Tint

const lane = (key: LaneKey, label: string, token: string): Lane =>
  ({ key, label, token, ...tint(token) })

/** Income in, spending out, saving aside, debt down — in the order they are shown. */
export const LANES: Lane[] = [
  lane('income', 'Income', 'income'),
  lane('spending', 'Spending', 'expense'),
  lane('saving', 'Saving', 'savings'),
  lane('debt', 'Debt', 'warning'),
]

export const LANE = Object.fromEntries(LANES.map((l) => [l.key, l])) as Record<LaneKey, Lane>

/** Which lane a transaction type and category fall into. */
export const laneOf = (type: string, category?: string | null): LaneKey =>
  type === 'income' ? 'income'
    : type === 'savings' ? 'saving'
      : category === 'Debt Repayment' ? 'debt'
        : 'spending'

// ── Household members ─────────────────────────────────────────────────────────
// Identity colours, not lane colours: they borrow the same tokens because the
// palette is the palette, but they mean "who", not "what kind of money".
export type Owner = Tint & { initials: string }

export const OWNERS: Record<string, Owner> = {
  Jean: { ...tint('accent'), initials: 'JA' },
  Henriette: { ...tint('savings'), initials: 'HF' },
  Noah: { ...tint('income'), initials: 'NN' },
  Joint: { ...tint('warning'), initials: 'JT' },
}

export const ownerTint = (owner?: string | null): Owner =>
  (owner && OWNERS[owner]) || {
    ...NEUTRAL_TINT,
    initials: (owner ?? '').slice(0, 2).toUpperCase(),
  }

/** Savings-goal horizons. */
export const HORIZONS: Record<string, Tint> = {
  short: tint('income'),
  medium: tint('warning'),
  long: tint('savings'),
}

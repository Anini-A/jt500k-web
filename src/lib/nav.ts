// Shared nav direction so the page transition knows which way to slide.
// +1 = moving toward Dashboard (slide in from the right), -1 = toward Transactions.
export const nav = { dir: 0 }

export type PageKey = 'home' | 'dashboard' | 'transactions'
// left → right order — shared by the top pill, the bottom bar's slide direction, and
// swipe navigation, so all three ways of moving between pages agree on what's "next".
export const PAGES: { key: PageKey; label: string; href: string }[] = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'transactions', label: 'Transactions', href: '/transactions' },
]

'use client'

import { useEffect, useState } from 'react'
import HeaderNav from '@/components/HeaderNav'
import PagePill from '@/components/PagePill'
import NotificationBell from '@/components/NotificationCenter'
import JourneyCard from '@/components/JourneyCard'
import MoneyFlowCard from '@/components/MoneyFlowCard'
import UpcomingBills from '@/components/UpcomingBills'
import { getJSON, cachedValue } from '@/lib/fresh'
import { signedRowAmount } from '@/lib/draftTotals'
import LoadError from '@/components/LoadError'

interface Stats { currentBalance: number; savingsRate: number; transactionCount: number; asOf: string; totalSavings: number; monthChange: number }

const money = (n: number) =>
  n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }) // to cents

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(() => cachedValue<Stats>('/api/stats')) // paint from cache instantly
  const [statsError, setStatsError] = useState(false)
  const [cards, setCards] = useState<{ card: string; total: number }[]>([]) // un-logged balance per credit card

  useEffect(() => {
    const load = () => {
      getJSON('/api/stats')
        .then((d) => { if (d && !d.error) { setStats(d); setStatsError(false) } else setStatsError((prev) => prev || !cachedValue('/api/stats')) })
        .catch(() => setStatsError(!cachedValue('/api/stats')))
      getJSON('/api/drafts').then((d: any[]) => {
        if (!Array.isArray(d)) return
        const m = new Map<string, number>()
        for (const draft of d) for (const r of draft.rows || []) {
          if (!r.card) continue
          m.set(r.card, (m.get(r.card) || 0) + signedRowAmount(r))
        }
        // a card whose rows cancel out (a refund against its own purchase) has nothing left
        // to show — drop it so the section empties out instead of printing "−$0"
        setCards([...m.entries()]
          .map(([card, total]) => ({ card, total: Math.round(total * 100) / 100 }))
          .filter((c) => c.total !== 0)
          .sort((a, b) => b.total - a.total))
      }).catch(() => {})
    }
    load()
    window.addEventListener('transaction-added', load)
    window.addEventListener('drafts-changed', load)
    return () => { window.removeEventListener('transaction-added', load); window.removeEventListener('drafts-changed', load) }
  }, [])

  const retryStats = () => {
    setStatsError(false)
    getJSON('/api/stats').then((d) => { if (d && !d.error) setStats(d); else setStatsError(true) }).catch(() => setStatsError(true))
  }

  const bal = stats?.currentBalance ?? 0
  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top">
          <NotificationBell />
          <PagePill current="home" />
          <HeaderNav current="home" />
        </header>

        {/* Headline hero — Net Worth + Journey/ETA to 500K, combined */}
        <section className="block">
          <JourneyCard />
        </section>

        {/* Current cash balance */}
        <section className="block">
          <div className="card glass">
              <span className="hdr-label">Cash balance</span>
              {statsError && !stats ? (
                <LoadError onRetry={retryStats} label="Couldn't load balance" />
              ) : (<>
              <div style={{ fontWeight: 700, fontSize: 'clamp(30px, 8vw, 42px)', letterSpacing: '-0.03em', marginTop: 4, color: bal >= 0 ? 'var(--text-primary)' : 'var(--expense)' }}>
                {stats ? money(bal) : <span className="skeleton" style={{ width: 170, height: '0.9em', verticalAlign: -2 }} />}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                {stats ? <>Chequing · as of {today}</> : <span className="skeleton" style={{ width: 150, height: 12 }} />}
              </div>
              </>)}

              {/* credit-card balances owed (from un-logged imports) — tap to review/import */}
              {cards.length > 0 && (
                <button onClick={() => window.dispatchEvent(new CustomEvent('open-add-import'))}
                  style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                  <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
                  <span className="hdr-label">Credit cards</span>
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    {cards.map((c) => (
                      <div key={c.card} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.card}</span>
                        {/* net refunds can put a card in credit — don't print "−-$44.79" in red */}
                        <span style={{ fontWeight: 600, flexShrink: 0, color: c.total > 0 ? 'var(--expense)' : 'var(--income)' }}>
                          {c.total > 0 ? '−' : '+'}{money(Math.abs(c.total))}
                        </span>
                      </div>
                    ))}
                  </div>
                </button>
              )}
          </div>
        </section>

        {/* Money Flow — income vs expenses vs savings, defaults to YTD */}
        <section className="block">
          <MoneyFlowCard />
        </section>

        {/* Upcoming bills — what's due next (hidden if no bills are set up) */}
        <section className="block">
          <UpcomingBills />
        </section>

        {/* Footer */}
        <footer style={{ textAlign: 'center', marginTop: 32, paddingBottom: 16 }}>
          {stats && (
            <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {stats.transactionCount.toLocaleString()} transactions tracked
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}

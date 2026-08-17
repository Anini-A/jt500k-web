'use client'

import { useEffect, useState } from 'react'
import HeaderNav from '@/components/HeaderNav'
import PagePill from '@/components/PagePill'
import Logo from '@/components/Logo'
import Link from 'next/link'
import JourneyCard from '@/components/JourneyCard'
import ActionItemsCard from '@/components/ActionItemsCard'
import MoneyFlowCard from '@/components/MoneyFlowCard'
import { getJSON } from '@/lib/fresh'

interface Stats { currentBalance: number; savingsRate: number; transactionCount: number; asOf: string; totalSavings: number }

const money = (n: number) =>
  n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }) // to cents

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [cards, setCards] = useState<{ card: string; total: number }[]>([]) // un-logged balance per credit card

  useEffect(() => {
    const load = () => {
      getJSON('/api/stats').then((d) => !d.error && setStats(d)).catch(() => {})
      getJSON('/api/drafts').then((d: any[]) => {
        if (!Array.isArray(d)) return
        const m = new Map<string, number>()
        for (const draft of d) for (const r of draft.rows || []) {
          const amt = parseFloat(String(r.amount)); if (isNaN(amt) || !r.card) continue
          m.set(r.card, (m.get(r.card) || 0) + amt)
        }
        setCards([...m.entries()].map(([card, total]) => ({ card, total })).sort((a, b) => b.total - a.total))
      }).catch(() => {})
    }
    load()
    window.addEventListener('transaction-added', load)
    window.addEventListener('drafts-changed', load)
    return () => { window.removeEventListener('transaction-added', load); window.removeEventListener('drafts-changed', load) }
  }, [])

  const bal = stats?.currentBalance ?? 0
  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top">
          <Link href="/" className="brand" aria-label="Home"><Logo /></Link>
          <PagePill current="home" />
          <HeaderNav current="home" />
        </header>

        {/* Headline hero — Net Worth + Journey/ETA to 500K, combined */}
        <section className="block">
          <JourneyCard />
        </section>

        {/* Current Balance · Action Items */}
        <section className="block">
          <div className="grid-2">
            <div className="card glass" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span className="hdr-label">Cash balance</span>
              <div style={{ fontWeight: 700, fontSize: 'clamp(30px, 8vw, 42px)', letterSpacing: '-0.03em', marginTop: 4, color: bal >= 0 ? 'var(--text-primary)' : 'var(--expense)' }}>
                {stats ? money(bal) : '—'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                Chequing · as of {today}{stats ? <> · <b style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{Math.round(stats.savingsRate)}%</b> saved</> : ''}
              </div>

              {/* credit-card balances owed (from un-logged imports) */}
              {cards.length > 0 && (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
                  <span className="hdr-label">Credit cards</span>
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    {cards.map((c) => (
                      <div key={c.card} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 14 }}>
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.card}</span>
                        <span style={{ fontWeight: 600, color: 'var(--expense)', flexShrink: 0 }}>−{money(c.total)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <ActionItemsCard />
          </div>
        </section>

        {/* Money Flow — income vs expenses vs savings, defaults to YTD */}
        <section className="block">
          <MoneyFlowCard />
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

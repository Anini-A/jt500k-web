'use client'

import { useEffect, useState } from 'react'
import HeaderNav from '@/components/HeaderNav'
import PagePill from '@/components/PagePill'
import Logo from '@/components/Logo'
import Link from 'next/link'
import JourneyCard from '@/components/JourneyCard'
import ActionItemsCard from '@/components/ActionItemsCard'
import MoneyFlowCard from '@/components/MoneyFlowCard'
import CardsToLogCard from '@/components/CardsToLogCard'
import AddTransactionButton from '@/components/AddTransactionButton'
import { getJSON } from '@/lib/fresh'

interface Stats { currentBalance: number; savingsRate: number; transactionCount: number; asOf: string; totalSavings: number }

const money = (n: number) =>
  n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }) // to cents

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    const load = () => {
      getJSON('/api/stats').then((d) => !d.error && setStats(d)).catch(() => {})
    }
    load()
    window.addEventListener('transaction-added', load)
    return () => window.removeEventListener('transaction-added', load)
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
              <span className="hdr-label">Current balance</span>
              <div style={{ fontWeight: 700, fontSize: 'clamp(30px, 8vw, 42px)', letterSpacing: '-0.03em', marginTop: 4, color: bal >= 0 ? 'var(--text-primary)' : 'var(--expense)' }}>
                {stats ? money(bal) : '—'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                As of {today}{stats ? <> · <b style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{Math.round(stats.savingsRate)}%</b> savings rate</> : ''}
              </div>
            </div>
            <ActionItemsCard />
          </div>
        </section>

        {/* Un-logged card balances (from saved Import drafts) — only shows when there are any */}
        <CardsToLogCard />

        {/* Money Flow — income vs expenses vs savings, defaults to YTD */}
        <section className="block">
          <MoneyFlowCard />
        </section>

        {/* headless — lets the "To log" card open the Import modal */}
        <AddTransactionButton trigger={false} />

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

'use client'

import { useEffect, useState } from 'react'
import HeaderNav from '@/components/HeaderNav'
import PagePill from '@/components/PagePill'
import Logo from '@/components/Logo'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import JourneyCard from '@/components/JourneyCard'
import ActionItemsCard from '@/components/ActionItemsCard'
import MoneyFlowCard from '@/components/MoneyFlowCard'
import SectionTitle from '@/components/SectionTitle'
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
              <SectionTitle icon={Wallet}>Current Balance</SectionTitle>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 0' }}>
                <div style={{ fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', color: bal >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  {stats ? money(bal) : '—'}
                </div>
                <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>As of {today}</span>
              </div>
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

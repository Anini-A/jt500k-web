'use client'

import { useEffect, useState } from 'react'
import HeaderNav from '@/components/HeaderNav'
import CategoryManager from '@/components/CategoryManager'

interface Settings {
  name: string
  goalAmount: number
  transactionCount: number
  categoryCount: number
  firstDate: string | null
  lastDate: string | null
}

const inp: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (!d.error) { setS(d); setName(d.name); setGoal(String(d.goalAmount)) }
    })
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setStatus(d.connected ? 'online' : 'offline'))
      .catch(() => setStatus('offline'))
  }, [])

  const statusMeta = {
    checking: { color: 'var(--text-muted)', label: 'Checking…' },
    online: { color: 'var(--income)', label: 'Connected' },
    offline: { color: 'var(--expense)', label: 'Offline' },
  }[status]

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, goalAmount: parseFloat(goal) }),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
      else alert('Could not save: ' + (await res.json()).error)
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <span>Settings</span>
          </div>
          <HeaderNav current="settings" />
        </header>

        {/* Connection status */}
        <section className="block">
          <h2>🗄️ Database</h2>
          <div className="card glass" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 12, height: 12, borderRadius: '50%', background: statusMeta.color,
              boxShadow: `0 0 0 4px color-mix(in srgb, ${statusMeta.color} 22%, transparent)`,
              flexShrink: 0,
              animation: status === 'checking' ? 'pulse 1.2s ease-in-out infinite' : 'none',
            }} />
            <div>
              <div style={{ fontWeight: 600 }}>Supabase — {statusMeta.label}</div>
              <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {status === 'online' ? 'Your data is live and syncing.' : status === 'offline' ? 'Cannot reach the database right now.' : 'Testing connection…'}
              </div>
            </div>
          </div>
        </section>

        {/* Manage */}
        <section className="block">
          <h2>🎯 Goal & Household</h2>
          <div className="card glass">
            <form onSubmit={save} style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span className="stat-label">Household name</span>
                <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Household" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span className="stat-label">Savings goal target ($)</span>
                <input style={inp} type="number" step="1000" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="500000" />
                <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  This drives the progress bar on your dashboard.
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : '💾 Save'}
                </button>
                {saved && <span style={{ color: 'var(--income)', fontWeight: 600 }}>✓ Saved</span>}
              </div>
            </form>
          </div>
        </section>

        {/* Data summary */}
        <section className="block">
          <h2>📊 Your Data</h2>
          <div className="card glass">
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Transactions</div>
                <div className="stat-value">{s ? s.transactionCount.toLocaleString() : '—'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Categories</div>
                <div className="stat-value">{s ? s.categoryCount : '—'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">First record</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{s?.firstDate ?? '—'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Latest record</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{s?.lastDate ?? '—'}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Category management */}
        <section className="block">
          <h2>🏷️ Categories</h2>
          <CategoryManager />
        </section>

        {/* Info */}
        <section className="block" style={{ marginBottom: 64 }}>
          <h2>🔐 Access</h2>
          <div className="card glass">
            <p style={{ marginTop: 0 }}>
              This site is protected by a <strong>shared password</strong>. It's remembered on each device, so you
              and your wife only enter it once per device.
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              To refresh from your Google Sheet: download it as CSV and re-run the import script. New transactions
              added in the app save instantly to the database.
            </p>
            <button
              className="btn btn-secondary"
              onClick={async () => { await fetch('/api/auth', { method: 'DELETE' }); window.location.href = '/login' }}
            >
              🚪 Sign out of this device
            </button>
            <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 16, marginBottom: 0 }}>
              Version <code>{(process.env.NEXT_PUBLIC_COMMIT_SHA || 'local').slice(0, 7)}</code>
              {process.env.NEXT_PUBLIC_BUILD_TIME ? ` · built ${new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleString()}` : ''}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

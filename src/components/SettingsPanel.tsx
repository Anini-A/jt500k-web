'use client'

import { useEffect, useState } from 'react'
import { Database, Target, BarChart3, LifeBuoy, Lock, LogOut, Download, Cloud, RefreshCw, Landmark } from 'lucide-react'
import CategoryManager from './CategoryManager'
import SectionTitle from './SectionTitle'
import { getJSON } from '@/lib/fresh'

interface Settings {
  name: string
  goalAmount: number
  transactionCount: number
  categoryCount: number
  firstDate: string | null
  lastDate: string | null
}

const inp: React.CSSProperties = {
  height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

// All settings content — used by the /settings page and the header popup.
export default function SettingsPanel() {
  const [s, setS] = useState<Settings | null>(null)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    getJSON('/api/settings').then((d) => {
      if (!d.error) { setS(d); setName(d.name); setGoal(String(d.goalAmount)) }
    })
    getJSON('/api/health')
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
    <>
      {/* Quick actions (moved out of the header) */}
      <section className="block">
        <div className="card glass" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}><RefreshCw size={15} /> Refresh data</button>
          <a className="btn btn-secondary" href="https://my.wealthsimple.com/app/login" target="_blank" rel="noopener noreferrer"><Landmark size={15} /> Open Wealthsimple</a>
        </div>
      </section>

      {/* Connection status */}
      <section className="block">
        <div className="card glass">
          <SectionTitle icon={Database} style={{ marginBottom: 14 }}>Database</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
        </div>
      </section>

      {/* Manage */}
      <section className="block">
        <div className="card glass">
          <SectionTitle icon={Target} style={{ marginBottom: 14 }}>Goal &amp; Household</SectionTitle>
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
                {saving ? 'Saving…' : 'Save'}
              </button>
              {saved && <span style={{ color: 'var(--income)', fontWeight: 600 }}>✓ Saved</span>}
            </div>
          </form>
        </div>
      </section>

      {/* Data summary */}
      <section className="block">
        <div className="card glass">
          <SectionTitle icon={BarChart3} style={{ marginBottom: 14 }}>Your Data</SectionTitle>
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
        <CategoryManager />
      </section>

      {/* Backup */}
      <section className="block">
        <div className="card glass">
          <SectionTitle icon={LifeBuoy} style={{ marginBottom: 14 }}>Backup</SectionTitle>
          <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 0, marginBottom: 14 }}>
            Download a complete snapshot of everything — transactions, categories, budgets, debts, and holdings — as a single JSON file. Keep it in your Google Drive; it's your safety net before any big change.
          </p>
          <BackupButton />
        </div>
      </section>

      {/* Info */}
      <section className="block" style={{ marginBottom: 8 }}>
        <div className="card glass">
          <SectionTitle icon={Lock} style={{ marginBottom: 14 }}>Access</SectionTitle>
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
<LogOut size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Sign out of this device
          </button>
          <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 16, marginBottom: 0 }}>
            Version <code>{(process.env.NEXT_PUBLIC_COMMIT_SHA || 'local').slice(0, 7)}</code>
            {process.env.NEXT_PUBLIC_BUILD_TIME ? ` · built ${new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleString()}` : ''}
          </p>
        </div>
      </section>
    </>
  )
}

function BackupButton() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [drive, setDrive] = useState<'idle' | 'busy'>('idle')
  const [driveMsg, setDriveMsg] = useState('')

  const download = async () => {
    setBusy(true); setDone(false)
    try {
      const res = await fetch('/api/export', { cache: 'no-store' })
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `jt500k-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      setDone(true); setTimeout(() => setDone(false), 3000)
    } finally { setBusy(false) }
  }

  const toDrive = async () => {
    setDrive('busy'); setDriveMsg('')
    try {
      const res = await fetch('/api/backup-now', { method: 'POST' })
      const d = await res.json()
      setDriveMsg(res.ok ? `✓ Saved to Drive${d.file ? ` (${d.file})` : ''}` : `✗ ${d.error || 'failed'}`)
    } catch {
      setDriveMsg('✗ Could not reach the backup script.')
    } finally { setDrive('idle') }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={download} disabled={busy}>{busy ? 'Preparing…' : <><Download size={15} /> Download backup</>}</button>
        <button className="btn btn-secondary" onClick={toDrive} disabled={drive === 'busy'}>{drive === 'busy' ? 'Backing up…' : <><Cloud size={15} /> Back up to Drive now</>}</button>
        {done && <span style={{ color: 'var(--income)', fontWeight: 600 }}>✓ Downloaded</span>}
      </div>
      {driveMsg && <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, color: driveMsg.startsWith('✓') ? 'var(--income)' : 'var(--expense)' }}>{driveMsg}</span>}
    </div>
  )
}

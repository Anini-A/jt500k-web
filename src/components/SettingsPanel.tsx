'use client'

import { useEffect, useState } from 'react'
import { LogOut, Download, Cloud, RefreshCw, Landmark } from 'lucide-react'
import CategoryManager from './CategoryManager'
import { getJSON } from '@/lib/fresh'
import { today } from '@/lib/date'

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
      {/* Goal & household */}
      <section className="block">
        <div className="card glass">
          <span className="hdr-label">Goal &amp; household</span>
          <form onSubmit={save} style={{ display: 'grid', gap: 14, maxWidth: 420, marginTop: 12 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="stat-label">Household name</span>
              <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Household" />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="stat-label">Savings goal ($)</span>
              <input style={inp} type="number" step="1000" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="500000" />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-primary" type="submit" disabled={saving} style={{ flex: 1, maxWidth: 206, justifyContent: 'center' }}>{saving ? 'Saving…' : 'Save'}</button>
              {saved && <span style={{ color: 'var(--income)', fontWeight: 600 }}>✓ Saved</span>}
            </div>
          </form>
        </div>
      </section>

      {/* Categories (kept as-is) */}
      <section className="block">
        <CategoryManager />
      </section>

      {/* Your data — one compact line + connection dot + quick actions */}
      <section className="block">
        <div className="card glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span className="hdr-label">Your data</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusMeta.color, flexShrink: 0, animation: status === 'checking' ? 'pulse 1.2s ease-in-out infinite' : 'none' }} />
              {statusMeta.label}
            </span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 10 }}>
            {s ? <><b style={{ fontWeight: 600 }}>{s.transactionCount.toLocaleString()}</b> transactions · <b style={{ fontWeight: 600 }}>{s.categoryCount}</b> categories{s.firstDate ? <> · {s.firstDate} → {s.lastDate}</> : ''}</> : '—'}
          </div>
          <div style={{ display: 'flex', gap: 8, maxWidth: 420, marginTop: 14 }}>
            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => window.location.reload()}><RefreshCw size={15} /> Refresh</button>
            <a className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} href="https://my.wealthsimple.com/app/login" target="_blank" rel="noopener noreferrer"><Landmark size={15} /> Wealthsimple</a>
          </div>
        </div>
      </section>

      {/* Backup */}
      <section className="block">
        <div className="card glass">
          <span className="hdr-label">Backup</span>
          <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: '8px 0 14px' }}>
            A full snapshot (transactions, budgets, debts, holdings) as one JSON file — your safety net before big changes.
          </p>
          <BackupButton />
        </div>
      </section>

      {/* Account */}
      <section className="block" style={{ marginBottom: 8 }}>
        <div className="card glass">
          <span className="hdr-label">Account</span>
          <p className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, margin: '8px 0 14px' }}>
            Protected by a shared password, remembered once per device.
          </p>
          <button className="btn btn-secondary" style={{ flex: 1, maxWidth: 206, justifyContent: 'center' }}
            onClick={async () => { await fetch('/api/auth', { method: 'DELETE' }); window.location.href = '/login' }}>
            <LogOut size={15} /> Sign out
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
      a.download = `jt500k-backup-${today()}.json`
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
      <div style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={download} disabled={busy}>{busy ? 'Preparing…' : <><Download size={15} /> Download</>}</button>
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={toDrive} disabled={drive === 'busy'}>{drive === 'busy' ? 'Backing up…' : <><Cloud size={15} /> To Drive</>}</button>
      </div>
      {done && <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--income)' }}>✓ Downloaded</span>}
      {driveMsg && <span className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, color: driveMsg.startsWith('✓') ? 'var(--income)' : 'var(--expense)' }}>{driveMsg}</span>}
    </div>
  )
}

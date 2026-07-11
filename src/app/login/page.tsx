'use client'

import { useState } from 'react'

export default function Login() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        window.location.href = '/'
      } else {
        setError('Incorrect password — try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-aurora">
      <div className="wrap" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 48 }}>
        <div className="card glass hero" style={{ width: 'min(400px, 100%)', textAlign: 'center' }}>
          <div style={{ fontSize: 44 }}>💵</div>
          <h1 style={{ fontSize: 24, margin: '8px 0 4px' }}>Journey to 500K</h1>
          <p className="lead" style={{ marginBottom: 20 }}>Enter the shared password to continue.</p>
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-primary)', fontSize: 16, textAlign: 'center' }}
            />
            {error && <div style={{ color: 'var(--expense)', fontSize: 14 }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>
              {busy ? 'Checking…' : '🔓 Unlock'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

'use client'

import { RotateCw } from 'lucide-react'

// Shown when a card's data failed to load AND there's no cached copy to fall back on.
// Keeps failures recoverable (a tap retries) instead of leaving a blank/forever-skeleton card.
export default function LoadError({ onRetry, label = "Couldn't load", compact }: { onRetry: () => void; label?: string; compact?: boolean }) {
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: compact ? '14px 8px' : '22px 8px', color: 'var(--text-muted)', fontSize: 13.5 }}>
      <span>{label}</span>
      <button onClick={onRetry}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--kpi-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
        <RotateCw size={14} /> Retry
      </button>
    </div>
  )
}

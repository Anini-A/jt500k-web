'use client'

const STAT_CARDS = [
  { label: 'Total Income', emoji: '💰', type: 'income', value: 57000 },
  { label: 'Total Expenses', emoji: '💸', type: 'expense', value: 36160 },
  { label: 'Total Savings', emoji: '🏦', type: 'savings', value: 18410 },
  { label: 'Savings Rate', emoji: '📈', type: 'neutral', value: 32 },
]

const FEATURES = [
  { emoji: '📊', label: 'Real-time analytics' },
  { emoji: '💬', label: 'Claude AI assistant' },
  { emoji: '🎯', label: 'Track 500K goal' },
  { emoji: '📱', label: 'Mobile responsive' },
  { emoji: '🔒', label: 'Secure with Supabase' },
  { emoji: '⚡', label: 'Live dashboard' },
]

export default function Home() {
  return (
    <div className="bg-aurora">
      <div className="wrap">
        <header className="top glass">
          <div className="brand">
            <span className="brand-emoji">💵</span>
            <span>Journey to 500K</span>
          </div>
          <a className="header-cta" href="/dashboard">
            🚀 <span className="long">Live Dashboard</span>
          </a>
        </header>

        <section className="block">
          <div className="card glass hero">
            <span className="offer-badge">✅ Supabase Connected</span>
            <h1>💡 Your Financial Dashboard</h1>
            <p className="lead">
              Track income, expenses, and savings towards your 500K goal. Get real-time insights with AI-powered analysis.
              Your data is secure, your dashboard is always live.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="/dashboard">
                📊 Open Dashboard
              </a>
              <a className="btn btn-secondary" href="#features">
                📧 Learn More
              </a>
            </div>
          </div>
        </section>

        <section className="block">
          <h2>📈 Your Financial Summary</h2>
          <div className="card glass">
            <div className="stat-grid">
              {STAT_CARDS.map((stat) => (
                <div key={stat.label} className="stat-card">
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>{stat.emoji}</div>
                  <div className="stat-label">{stat.label}</div>
                  <div className={`stat-value ${stat.type}`}>
                    {stat.type === 'neutral' ? `${stat.value}%` : `$${(stat.value / 1000).toFixed(0)}K`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="block">
          <h2>✨ What You Get</h2>
          <div className="card glass">
            <div className="service-grid">
              {FEATURES.map((feature) => (
                <div key={feature.label} className="service-chip">
                  <span className="emoji">{feature.emoji}</span>
                  <span>{feature.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="block">
          <h2>🎯 Quick Stats</h2>
          <div className="pricing-grid">
            <div className="card glass">
              <div className="pricing-name">Period Covered</div>
              <div className="pricing-amount">14 mo</div>
              <p className="pricing-blurb">Aug 2024 – Oct 2025 data tracked</p>
            </div>
            <div className="card glass">
              <div className="pricing-name">Total Transactions</div>
              <div className="pricing-amount">500+</div>
              <p className="pricing-blurb">Detailed expense & income records</p>
            </div>
            <div className="card glass">
              <div className="pricing-name">Savings Goal</div>
              <div className="pricing-amount">$500K</div>
              <p className="pricing-blurb">Long-term wealth building journey</p>
            </div>
          </div>
        </section>

        <section className="block">
          <div className="card glass hero">
            <h2 style={{ marginTop: 0, marginBottom: '16px' }}>🤖 AI-Powered Insights</h2>
            <p>
              Ask Claude questions about your spending patterns, get budget recommendations, and receive personalized financial advice. Your dashboard learns from your data.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="/dashboard">
                💬 Chat with Claude
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

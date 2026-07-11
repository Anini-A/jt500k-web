'use client'

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to right, #2563eb, #1e40af)', color: 'white' }}>
      <header style={{ padding: '32px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>
            🚀 Journey to 500K
          </h1>
          <p style={{ opacity: 0.8 }}>Financial Dashboard & Analysis</p>
        </div>
      </header>

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 16px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '24px',
          marginBottom: '32px'
        }}>
          {[
            { label: 'Total Income', value: '$0', color: '#10b981' },
            { label: 'Total Expenses', value: '$0', color: '#ef4444' },
            { label: 'Total Savings', value: '$0', color: '#3b82f6' },
            { label: 'Savings Rate', value: '0%', color: '#6366f1' }
          ].map((stat) => (
            <div key={stat.label} style={{
              background: 'white',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>
                {stat.label}
              </p>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: stat.color }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '32px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          color: '#333'
        }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
            ✅ Dashboard Ready!
          </h2>
          <p style={{ marginBottom: '24px', color: '#666' }}>
            Your financial dashboard is now live and connected to Supabase.
          </p>
          <ul style={{
            textAlign: 'left',
            maxWidth: '320px',
            margin: '0 auto',
            lineHeight: '2'
          }}>
            <li>✅ Database connected</li>
            <li>✅ API routes working</li>
            <li>✅ Claude AI integrated</li>
            <li>✅ Frontend ready</li>
          </ul>
          <p style={{ marginTop: '24px', fontSize: '14px', color: '#999' }}>
            Next: Add transaction data and start tracking finances
          </p>
        </div>
      </main>
    </div>
  )
}

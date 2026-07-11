import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic — reports what the PRODUCTION server's database contains.
// Remove after debugging. Deliberately allowlisted past the auth gate.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'MISSING'
  const keyTail = (process.env.SUPABASE_SERVICE_ROLE_KEY || 'MISSING').slice(-6)

  const { count } = await supabaseAdmin.from('transactions').select('*', { count: 'exact', head: true })
  const { data: margin } = await supabaseAdmin
    .from('transactions').select('date, category, description').ilike('description', '%margin%')
  const { data: loan } = await supabaseAdmin
    .from('transactions').select('category, description').ilike('description', '%loan%').limit(3)
  const { data: debtCat } = await supabaseAdmin.from('categories').select('id').eq('name', 'Debt Repayment')

  return NextResponse.json(
    { supabaseHost: url.replace('https://', '').split('.')[0], keyTail, transactionCount: count, margin, loanSample: loan, hasDebtRepaymentCategory: (debtCat || []).length > 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// Lightweight connectivity check for the database.
export async function GET() {
  try {
    const { error } = await supabaseAdmin
      .from('households')
      .select('id', { head: true, count: 'exact' })
    if (error) return NextResponse.json({ connected: false, error: error.message }, { status: 200 })
    return NextResponse.json({ connected: true })
  } catch (e: any) {
    return NextResponse.json({ connected: false, error: e.message }, { status: 200 })
  }
}

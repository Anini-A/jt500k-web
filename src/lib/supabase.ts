import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client using the service-role key.
// Only import this from API routes / server code — never from the browser.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    // CRITICAL: Next.js patches server-side fetch and caches GET responses in
    // its Data Cache — which froze our Supabase reads at an old snapshot.
    // Force every Supabase request to bypass that cache.
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
})

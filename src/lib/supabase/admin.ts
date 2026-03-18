import { createClient } from '@supabase/supabase-js'

// IMPORTANT: This client uses the SERVICE_ROLE_KEY and will BYPASS Row Level Security.
// Never expose this key or client to the frontend, and only use it in secure server actions
// where you explicitly handle authorization logic.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

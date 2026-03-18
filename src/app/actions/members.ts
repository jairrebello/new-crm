'use server'

import { createClient } from '@/lib/supabase/server'

export type TenantMemberOption = {
  user_id: string
  email: string
  first_name: string | null
  last_name: string | null
}

function firstOrNull<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null
  return (value as T) ?? null
}

export async function listTenantMemberOptions(tenantSlug: string): Promise<TenantMemberOption[]> {
  const supabase = await createClient()

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .single()
  if (tenantError) throw new Error(tenantError.message)
  if (!tenant) return []

  const { data, error } = await supabase
    .from('tenant_users')
    .select('user_id, user:users(email, first_name, last_name)')
    .eq('tenant_id', tenant.id)

  if (error) throw new Error(error.message)

  return (data ?? []).map((row: unknown) => {
    const r = row as { user_id: string; user?: unknown }
    const u = firstOrNull<{ email: string; first_name: string | null; last_name: string | null }>(r.user)
    return {
      user_id: r.user_id,
      email: u?.email ?? '',
      first_name: u?.first_name ?? null,
      last_name: u?.last_name ?? null,
    } satisfies TenantMemberOption
  })
}


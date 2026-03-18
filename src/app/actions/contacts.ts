'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type Account = {
  id: string
  name: string
}

export type Contact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  account_id: string | null
  created_at: string
  account?: Account | null
}

export type ContactOption = {
  id: string
  name: string
  email: string | null
  phone: string | null
}

async function getTenantIdBySlugOrThrow(tenantSlug: string) {
  const supabase = await createClient()
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .single()

  if (error) throw new Error(error.message)
  if (!tenant) throw new Error('Tenant não encontrado')
  return tenant.id as string
}

function firstOrNull<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null
  return (value as T) ?? null
}

export async function listAccounts(tenantSlug: string): Promise<Account[]> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(tenantSlug)

  const { data, error } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as Account[]
}

export async function listContacts(tenantSlug: string, opts?: { q?: string }): Promise<Contact[]> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(tenantSlug)

  let query = supabase
    .from('contacts')
    .select('id, name, email, phone, notes, account_id, created_at, account:accounts(id, name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  const q = opts?.q?.trim()
  if (q) {
    // Simple OR search on common fields
    const escaped = q.replaceAll(',', ' ')
    query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).map((row: unknown) => {
    const r = row as Contact & { account?: unknown }
    return {
      ...r,
      account: firstOrNull<Account>(r.account),
    } satisfies Contact
  })
}

export async function listContactOptions(tenantSlug: string): Promise<ContactOption[]> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(tenantSlug)

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, email, phone')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)
  return (data ?? []) as ContactOption[]
}

export async function createAccount(input: { tenantSlug: string; name: string }): Promise<Account> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(input.tenantSlug)

  const { data, error } = await supabase
    .from('accounts')
    .insert({ tenant_id: tenantId, name: input.name.trim() })
    .select('id, name')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/${input.tenantSlug}/contacts`)
  return data as Account
}

export async function createContact(input: {
  tenantSlug: string
  name: string
  email?: string | null
  phone?: string | null
  notes?: string | null
  accountId?: string | null
}): Promise<Contact> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(input.tenantSlug)

  const payload = {
    tenant_id: tenantId,
    name: input.name.trim(),
    email: input.email?.trim() ? input.email.trim() : null,
    phone: input.phone?.trim() ? input.phone.trim() : null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    account_id: input.accountId ?? null,
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert(payload)
    .select('id, name, email, phone, notes, account_id, created_at, account:accounts(id, name)')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/${input.tenantSlug}/contacts`)
  const r = data as unknown as Omit<Contact, 'account'> & { account?: unknown }
  return {
    ...r,
    account: firstOrNull<Account>(r.account),
  } satisfies Contact
}


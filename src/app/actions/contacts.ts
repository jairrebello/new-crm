'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizePhoneWithDefaultBR } from '@/lib/phone'

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

  const normalizedPhone = normalizePhoneWithDefaultBR(input.phone ?? null)

  const payload = {
    tenant_id: tenantId,
    name: input.name.trim(),
    email: input.email?.trim() ? input.email.trim() : null,
    phone: normalizedPhone,
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

export type ImportContactsRow = {
  name: string
  email?: string | null
  phone?: string | null
  notes?: string | null
  accountId?: string | null
}

export type ImportContactsResult = {
  inserted: number
  skippedInvalid: number
  skippedDuplicates: number
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr]
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function importContacts(input: {
  tenantSlug: string
  rows: ImportContactsRow[]
  defaultCountry?: 'BR'
}): Promise<ImportContactsResult> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(input.tenantSlug)

  let skippedInvalid = 0
  const prepared = input.rows
    .map((r) => {
      const name = (r.name ?? '').trim()
      if (!name) {
        skippedInvalid++
        return null
      }

      const email = r.email?.trim() ? r.email.trim() : null
      const phone = normalizePhoneWithDefaultBR(r.phone ?? null)
      const notes = r.notes?.trim() ? r.notes.trim() : null
      const accountId = r.accountId ?? null

      return {
        tenant_id: tenantId,
        name,
        email,
        phone,
        notes,
        account_id: accountId,
      }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))

  if (prepared.length === 0) {
    return { inserted: 0, skippedInvalid, skippedDuplicates: 0 }
  }

  // Deduplicate within the import batch (after normalization)
  const seenEmails = new Set<string>()
  const seenPhones = new Set<string>()
  const deduped: typeof prepared = []
  let skippedInBatch = 0
  for (const p of prepared) {
    const emailKey = p.email?.toLowerCase() ?? null
    const phoneKey = p.phone ?? null
    if (emailKey && seenEmails.has(emailKey)) {
      skippedInBatch++
      continue
    }
    if (phoneKey && seenPhones.has(phoneKey)) {
      skippedInBatch++
      continue
    }
    if (emailKey) seenEmails.add(emailKey)
    if (phoneKey) seenPhones.add(phoneKey)
    deduped.push(p)
  }

  const emails = Array.from(
    new Set(deduped.map((p) => p.email).filter((v): v is string => Boolean(v)))
  )
  const phones = Array.from(
    new Set(deduped.map((p) => p.phone).filter((v): v is string => Boolean(v)))
  )

  const existingEmails = new Set<string>()
  const existingPhones = new Set<string>()

  for (const group of chunk(emails, 500)) {
    const { data, error } = await supabase
      .from('contacts')
      .select('email')
      .eq('tenant_id', tenantId)
      .in('email', group)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const v = (row as { email: string | null }).email
      if (v) existingEmails.add(v)
    }
  }

  for (const group of chunk(phones, 500)) {
    const { data, error } = await supabase
      .from('contacts')
      .select('phone')
      .eq('tenant_id', tenantId)
      .in('phone', group)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const v = (row as { phone: string | null }).phone
      if (v) existingPhones.add(v)
    }
  }

  const filtered = deduped.filter((p) => {
    const emailKey = p.email?.toLowerCase() ?? null
    if (emailKey && existingEmails.has(p.email!)) return false
    if (p.phone && existingPhones.has(p.phone)) return false
    return true
  })

  const skippedDuplicates = skippedInBatch + (deduped.length - filtered.length)
  if (filtered.length === 0) {
    return { inserted: 0, skippedInvalid, skippedDuplicates }
  }

  const { error } = await supabase.from('contacts').insert(filtered)
  if (error) throw new Error(error.message)

  revalidatePath(`/${input.tenantSlug}/contacts`)
  return { inserted: filtered.length, skippedInvalid, skippedDuplicates }
}


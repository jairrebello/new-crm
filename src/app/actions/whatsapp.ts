'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type WhatsAppInstance = {
  id: string
  tenant_id: string
  name: string
  provider: string
  provider_instance_key: string
  instance_token: string
  phone_number: string | null
  api_base_url: string | null
  api_token: string | null
  webhook_secret: string
  is_active: boolean
  created_at: string
  updated_at: string
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

export async function listWhatsAppInstances(tenantSlug: string): Promise<WhatsAppInstance[]> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(tenantSlug)

  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select(
      'id, tenant_id, name, provider, provider_instance_key, instance_token, phone_number, api_base_url, api_token, webhook_secret, is_active, created_at, updated_at'
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as WhatsAppInstance[]
}

export async function createWhatsAppInstance(input: {
  tenantSlug: string
  name: string
  instanceToken: string
  phoneNumber?: string | null
  apiBaseUrl?: string | null
  apiToken?: string | null
}): Promise<WhatsAppInstance> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(input.tenantSlug)
  const token = input.instanceToken.trim()

  const { data, error } = await supabase
    .from('whatsapp_instances')
    .insert({
      tenant_id: tenantId,
      name: input.name.trim(),
      provider: 'uazapi',
      instance_token: token,
      provider_instance_key: token, // backward compatibility
      webhook_secret: token, // backward compatibility
      phone_number: input.phoneNumber?.trim() ? input.phoneNumber.trim() : null,
      api_base_url: input.apiBaseUrl?.trim() ? input.apiBaseUrl.trim() : null,
      api_token: input.apiToken?.trim() ? input.apiToken.trim() : null,
      is_active: true,
    })
    .select(
      'id, tenant_id, name, provider, provider_instance_key, instance_token, phone_number, api_base_url, api_token, webhook_secret, is_active, created_at, updated_at'
    )
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/${input.tenantSlug}/settings`)
  return data as WhatsAppInstance
}

export async function updateWhatsAppInstance(input: {
  tenantSlug: string
  instanceId: string
  fields: Partial<{
    name: string
    instance_token: string
    phone_number: string | null
    api_base_url: string | null
    api_token: string | null
    is_active: boolean
  }>
}) {
  const supabase = await createClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof input.fields.name === 'string') patch.name = input.fields.name.trim()
  if (typeof input.fields.instance_token === 'string') {
    const token = input.fields.instance_token.trim()
    patch.instance_token = token
    patch.provider_instance_key = token // backward compatibility
    patch.webhook_secret = token // backward compatibility
  }
  if ('phone_number' in input.fields) patch.phone_number = input.fields.phone_number ?? null
  if ('api_base_url' in input.fields) patch.api_base_url = input.fields.api_base_url ?? null
  if ('api_token' in input.fields) patch.api_token = input.fields.api_token ?? null
  if (typeof input.fields.is_active === 'boolean') patch.is_active = input.fields.is_active

  const { error } = await supabase.from('whatsapp_instances').update(patch).eq('id', input.instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/${input.tenantSlug}/settings`)
  revalidatePath(`/${input.tenantSlug}/inbox`)
}


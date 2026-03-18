'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type Conversation = {
  id: string
  tenant_id: string
  whatsapp_instance_id: string
  contact_id: string | null
  contact_phone: string | null
  contact_name: string | null
  assigned_user_id: string | null
  status: string
  unread_count: number
  last_message_at: string | null
  created_at: string
}

export type ConversationMessage = {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  body: string
  created_at: string
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

export async function listConversations(tenantSlug: string): Promise<Conversation[]> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(tenantSlug)

  const { data, error } = await supabase
    .from('conversations')
    .select(
      'id, tenant_id, whatsapp_instance_id, contact_id, contact_phone, contact_name, assigned_user_id, status, unread_count, last_message_at, created_at'
    )
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100)

  if (error) throw new Error(error.message)
  return (data ?? []) as Conversation[]
}

export async function listConversationsFiltered(
  tenantSlug: string,
  filters: Partial<{
    status: 'open' | 'waiting' | 'closed'
    unreadOnly: boolean
    assignedToMe: boolean
  }>
): Promise<Conversation[]> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(tenantSlug)
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id ?? null

  let q = supabase
    .from('conversations')
    .select(
      'id, tenant_id, whatsapp_instance_id, contact_id, contact_phone, contact_name, assigned_user_id, status, unread_count, last_message_at, created_at'
    )
    .eq('tenant_id', tenantId)

  if (filters.status) q = q.eq('status', filters.status)
  if (filters.unreadOnly) q = q.gt('unread_count', 0)
  if (filters.assignedToMe && userId) q = q.eq('assigned_user_id', userId)

  const { data, error } = await q.order('last_message_at', { ascending: false, nullsFirst: false }).limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as Conversation[]
}

export async function getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, conversation_id, direction, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) throw new Error(error.message)
  return (data ?? []) as ConversationMessage[]
}

export async function markConversationRead(conversationId: string, tenantSlug: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversations')
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  if (error) throw new Error(error.message)
  revalidatePath(`/${tenantSlug}/inbox`)
}

export async function updateConversation(input: {
  tenantSlug: string
  conversationId: string
  fields: Partial<{
    status: 'open' | 'waiting' | 'closed'
    assigned_user_id: string | null
    unread_count: number
  }>
}) {
  const supabase = await createClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof input.fields.status === 'string') patch.status = input.fields.status
  if ('assigned_user_id' in input.fields) patch.assigned_user_id = input.fields.assigned_user_id ?? null
  if (typeof input.fields.unread_count === 'number') patch.unread_count = input.fields.unread_count

  const { error } = await supabase.from('conversations').update(patch).eq('id', input.conversationId)
  if (error) throw new Error(error.message)
  revalidatePath(`/${input.tenantSlug}/inbox`)
}

export async function sendConversationMessage(input: {
  tenantSlug: string
  conversationId: string
  body: string
}): Promise<void> {
  const supabase = await createClient()
  const body = input.body.trim()
  if (!body) return

  // Load conversation for tenant_id + instance_id + destination phone
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('id, tenant_id, whatsapp_instance_id, contact_phone')
    .eq('id', input.conversationId)
    .single()

  if (convError) throw new Error(convError.message)
  if (!conv) throw new Error('Conversa não encontrada')

  // Store message first (MVP)
  const now = new Date().toISOString()
  const { error: msgError } = await supabase.from('conversation_messages').insert({
    tenant_id: conv.tenant_id,
    conversation_id: conv.id,
    whatsapp_instance_id: conv.whatsapp_instance_id,
    direction: 'outbound',
    body,
    sent_at: now,
    status: 'stored',
  })
  if (msgError) throw new Error(msgError.message)

  // Update conversation last_message_at
  const { error: convUpdError } = await supabase
    .from('conversations')
    .update({ last_message_at: now, updated_at: now })
    .eq('id', conv.id)
  if (convUpdError) throw new Error(convUpdError.message)

  // Optional: attempt delivery via provider if instance has API configured
  const { data: inst } = await supabase
    .from('whatsapp_instances')
    .select('api_base_url, api_token, provider, provider_instance_key')
    .eq('id', conv.whatsapp_instance_id)
    .single()

  if (inst?.api_base_url && inst?.api_token && conv.contact_phone) {
    try {
      const url = `${inst.api_base_url.replace(/\/$/, '')}/messages/text`
      await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${inst.api_token}`,
        },
        body: JSON.stringify({
          instanceKey: inst.provider_instance_key,
          to: conv.contact_phone,
          text: body,
        }),
      })
      // We keep status as 'stored' in MVP; phase 2 can reconcile delivery receipts
    } catch {
      // Ignore send errors in MVP; message remains stored
    }
  }

  revalidatePath(`/${input.tenantSlug}/inbox`)
}


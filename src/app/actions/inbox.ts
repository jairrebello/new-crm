'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizePhoneWithDefaultBR } from '@/lib/phone'

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
  ignored: boolean
}

export type ConversationMessage = {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  body: string
  status?: 'stored' | 'sent' | 'failed' | 'delivered' | 'read'
  delivered_at?: string | null
  read_at?: string | null
  created_at: string
}

export type ConversationContext = {
  conversation: Conversation
  contact: { id: string; name: string; phone: string | null; email: string | null; notes: string | null } | null
  contactTags: Array<{ id: string; name: string; color: string | null }>
  deals: Array<{
    id: string
    title: string
    status: string
    priority: string
    deal_value: number
    created_at: string
  }>
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
      'id, tenant_id, whatsapp_instance_id, contact_id, contact_phone, contact_name, assigned_user_id, status, unread_count, last_message_at, created_at, ignored'
    )
    .eq('tenant_id', tenantId)
    .eq('ignored', false)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Conversation[]
  return dedupeConversationsByCanonicalPhone(rows)
}

export async function listConversationsFiltered(
  tenantSlug: string,
  filters: Partial<{
    status: 'open' | 'waiting' | 'closed'
    unreadOnly: boolean
    assignedToMe: boolean
    ignoredOnly: boolean
  }>
): Promise<Conversation[]> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(tenantSlug)
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id ?? null

  let q = supabase
    .from('conversations')
    .select(
      'id, tenant_id, whatsapp_instance_id, contact_id, contact_phone, contact_name, assigned_user_id, status, unread_count, last_message_at, created_at, ignored'
    )
    .eq('tenant_id', tenantId)

  if (filters.ignoredOnly) q = q.eq('ignored', true)
  else q = q.eq('ignored', false)

  if (filters.status) q = q.eq('status', filters.status)
  if (filters.unreadOnly) q = q.gt('unread_count', 0)
  if (filters.assignedToMe && userId) q = q.eq('assigned_user_id', userId)

  const { data, error } = await q.order('last_message_at', { ascending: false, nullsFirst: false }).limit(200)
  if (error) throw new Error(error.message)
  return dedupeConversationsByCanonicalPhone((data ?? []) as Conversation[])
}

function canonicalPhoneKey(conversation: Conversation): string {
  if (conversation.contact_phone) {
    const canonical = normalizePhoneWithDefaultBR(conversation.contact_phone)
    if (canonical) return `${conversation.whatsapp_instance_id}:${canonical}`
  }
  if (conversation.contact_id) return `${conversation.whatsapp_instance_id}:contact:${conversation.contact_id}`
  return `${conversation.whatsapp_instance_id}:id:${conversation.id}`
}

function lastMessageAtValue(ts: string | null): number {
  if (!ts) return 0
  const n = new Date(ts).getTime()
  return Number.isFinite(n) ? n : 0
}

function dedupeConversationsByCanonicalPhone(rows: Conversation[]): Conversation[] {
  const byKey = new Map<string, Conversation>()

  for (const c of rows) {
    const key = canonicalPhoneKey(c)
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, c)
      continue
    }

    // Keep the most recent conversation (best UX in list).
    if (lastMessageAtValue(c.last_message_at) > lastMessageAtValue(prev.last_message_at)) {
      byKey.set(key, c)
    }
  }

  return Array.from(byKey.values()).sort((a, b) => lastMessageAtValue(b.last_message_at) - lastMessageAtValue(a.last_message_at))
}

export async function getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, conversation_id, direction, body, status, delivered_at, read_at, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) throw new Error(error.message)
  return (data ?? []) as ConversationMessage[]
}

export async function reconcileConversationOutboundStatuses(conversationId: string): Promise<void> {
  const supabase = await createClient()

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, whatsapp_instance_id, contact_phone')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv?.whatsapp_instance_id || !conv.contact_phone) return

  const { data: inst } = await supabase
    .from('whatsapp_instances')
    .select('provider, api_base_url, instance_token')
    .eq('id', conv.whatsapp_instance_id)
    .maybeSingle()

  if (!inst || inst.provider !== 'uazapi' || !inst.api_base_url || !inst.instance_token) return

  const { data: pending } = await supabase
    .from('conversation_messages')
    .select('id, status, created_at')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .in('status', ['stored', 'sent', 'delivered'])
    .order('created_at', { ascending: false })
    .limit(25)

  if (!pending || pending.length === 0) return

  const normalizeDigits = (raw: string) => raw.replace(/[^\d]/g, '')
  const chatid = `${normalizeDigits(conv.contact_phone)}@s.whatsapp.net`

  const url = `${inst.api_base_url.replace(/\/$/, '')}/message/find`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2500)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      token: inst.instance_token,
    },
    body: JSON.stringify({
      chatid,
      limit: 50,
      offset: 0,
      track_source: 'new-crm',
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  if (!res.ok) return

  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    return
  }

  let items: unknown[] = []
  if (Array.isArray(payload)) {
    items = payload as unknown[]
  } else if (typeof payload === 'object' && payload !== null) {
    const p = payload as Record<string, unknown>
    if (Array.isArray(p.data)) items = p.data
    else if (Array.isArray(p.messages)) items = p.messages
  }
  if (items.length === 0) return

  const byTrackId = new Map<string, unknown>()
  for (const it of items) {
    const candidate = (typeof it === 'object' && it !== null ? (it as Record<string, unknown>) : null) ?? {}
    const trackId =
      typeof candidate.track_id === 'string' ? candidate.track_id : typeof candidate.trackId === 'string' ? candidate.trackId : null
    const trackSource =
      typeof candidate.track_source === 'string'
        ? candidate.track_source
        : typeof candidate.trackSource === 'string'
          ? candidate.trackSource
          : null
    if (trackId && (!trackSource || trackSource === 'new-crm')) byTrackId.set(trackId, it)
  }

  const toUpdate = pending
    .map((m) => ({ local: m, remote: byTrackId.get(m.id) }))
    .filter((x) => Boolean(x.remote))

  if (toUpdate.length === 0) return

  function coerceRemoteStatus(remote: unknown) {
    const r = (typeof remote === 'object' && remote !== null ? (remote as Record<string, unknown>) : null) ?? {}
    const statusStr = typeof r.status === 'string' ? r.status.toLowerCase() : null
    const ack = typeof r.ack === 'number' ? r.ack : typeof r.messageAck === 'number' ? r.messageAck : null
    const delivered = Boolean((r.delivered ?? r.isDelivered) as unknown)
    const read = Boolean((r.read ?? r.isRead ?? r.seen) as unknown)

    if (statusStr === 'read' || read) return 'read' as const
    if (statusStr === 'delivered' || delivered || (typeof ack === 'number' && ack >= 2)) return 'delivered' as const
    if (statusStr === 'sent' || (typeof ack === 'number' && ack >= 1)) return 'sent' as const
    if (statusStr === 'failed') return 'failed' as const
    return null
  }

  const nowIso = new Date().toISOString()

  for (const { local, remote } of toUpdate) {
    const next = coerceRemoteStatus(remote)
    if (!next) continue

    const patch: Record<string, unknown> = {
      status: next,
      metadata: { uazapi: remote, reconciled_at: nowIso },
    }
    if (next === 'delivered') patch.delivered_at = nowIso
    if (next === 'read') {
      patch.delivered_at = nowIso
      patch.read_at = nowIso
    }

    await supabase.from('conversation_messages').update(patch).eq('id', local.id)
  }
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
    ignored: boolean
  }>
}) {
  const supabase = await createClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof input.fields.status === 'string') patch.status = input.fields.status
  if ('assigned_user_id' in input.fields) patch.assigned_user_id = input.fields.assigned_user_id ?? null
  if (typeof input.fields.unread_count === 'number') patch.unread_count = input.fields.unread_count
  if (typeof input.fields.ignored === 'boolean') patch.ignored = input.fields.ignored

  const { error } = await supabase.from('conversations').update(patch).eq('id', input.conversationId)
  if (error) throw new Error(error.message)
  revalidatePath(`/${input.tenantSlug}/inbox`)
}

export async function getConversationContext(tenantSlug: string, conversationId: string): Promise<ConversationContext> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(tenantSlug)

  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select(
      'id, tenant_id, whatsapp_instance_id, contact_id, contact_phone, contact_name, assigned_user_id, status, unread_count, last_message_at, created_at, ignored'
    )
    .eq('tenant_id', tenantId)
    .eq('id', conversationId)
    .single()

  if (convError) throw new Error(convError.message)

  let contactId: string | null = conv.contact_id ?? null
  if (!contactId && conv.contact_phone) {
    const { data: contactByPhone } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', conv.contact_phone)
      .maybeSingle()
    contactId = contactByPhone?.id ?? null
  }

  const { data: contact } = contactId
    ? await supabase
        .from('contacts')
        .select('id, name, phone, email, notes')
        .eq('tenant_id', tenantId)
        .eq('id', contactId)
        .single()
    : { data: null as { id: string; name: string; phone: string | null; email: string | null; notes: string | null } | null }

  let contactTags: ConversationContext['contactTags'] = []
  if (contactId) {
    const { data: tagLinks } = await supabase
      .from('contact_tags')
      .select('tag_id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
    const tids = Array.from(new Set((tagLinks ?? []).map((r) => r.tag_id).filter(Boolean)))
    if (tids.length > 0) {
      const { data: tagRows } = await supabase
        .from('tags')
        .select('id, name, color')
        .eq('tenant_id', tenantId)
        .in('id', tids)
      contactTags = (tagRows ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color }))
    }
  }

  const { data: deals } = contactId
    ? await supabase
        .from('deals')
        .select('id, title, status, priority, deal_value, created_at')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50)
    : {
        data: [] as Array<{
          id: string
          title: string
          status: string
          priority: string
          deal_value: number
          created_at: string
        }>,
      }

  return {
    conversation: conv as Conversation,
    contact: contact ?? null,
    contactTags,
    deals: (deals ?? []) as ConversationContext['deals'],
  }
}

export async function createDealFromInbox(input: {
  tenantSlug: string
  contactId: string
  title: string
  dealValue?: number
  priority?: 'low' | 'medium' | 'high'
}) {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(input.tenantSlug)

  // Pick default pipeline; fallback to first pipeline created
  const { data: pipeline, error: pipelineError } = await supabase
    .from('pipelines')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (pipelineError) throw new Error(pipelineError.message)
  if (!pipeline) throw new Error('Nenhuma pipeline encontrada para este tenant.')

  // First stage by sort_order
  const { data: stage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('pipeline_id', pipeline.id)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (stageError) throw new Error(stageError.message)
  if (!stage) throw new Error('Nenhuma etapa encontrada para a pipeline.')

  const { data: authUser } = await supabase.auth.getUser()

  const { data: created, error } = await supabase
    .from('deals')
    .insert({
      tenant_id: tenantId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      title: input.title.trim(),
      contact_id: input.contactId,
      deal_value: input.dealValue ?? 0,
      priority: input.priority ?? 'medium',
      owner_user_id: authUser.user?.id ?? null,
      status: 'open',
    })
    .select('id, title, status, priority, deal_value, created_at')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/${input.tenantSlug}/crm`)
  revalidatePath(`/${input.tenantSlug}/inbox`)
  return created
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

  // Store message first
  const now = new Date().toISOString()
  const { data: createdMsg, error: msgError } = await supabase
    .from('conversation_messages')
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      whatsapp_instance_id: conv.whatsapp_instance_id,
      direction: 'outbound',
      body,
      sent_at: now,
      status: 'stored',
    })
    .select('id')
    .single()
  if (msgError) throw new Error(msgError.message)

  // Update conversation last_message_at
  const { error: convUpdError } = await supabase
    .from('conversations')
    .update({ last_message_at: now, updated_at: now })
    .eq('id', conv.id)
  if (convUpdError) throw new Error(convUpdError.message)

  // Attempt delivery via provider if instance has API configured
  const { data: inst } = await supabase
    .from('whatsapp_instances')
    .select('api_base_url, instance_token, provider')
    .eq('id', conv.whatsapp_instance_id)
    .single()

  const msgId = createdMsg?.id as string | undefined

  function normalizeUazapiNumber(raw: string) {
    // Uazapi expects digits (e.g. 5511999999999)
    return raw.replace(/[^\d]/g, '')
  }

  if (inst?.provider === 'uazapi' && inst.api_base_url && inst.instance_token && conv.contact_phone && msgId) {
    let status: 'sent' | 'failed' = 'failed'
    let externalId: string | null = null
    let errorText: string | null = null
    try {
      const url = `${inst.api_base_url.replace(/\/$/, '')}/send/text`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          token: inst.instance_token,
        },
        body: JSON.stringify({
          number: normalizeUazapiNumber(conv.contact_phone),
          text: body,
          track_source: 'new-crm',
          track_id: msgId,
        }),
      })

      const raw = await res.text()
      if (!res.ok) {
        errorText = raw || `uazapi_error_http_${res.status}`
      } else {
        status = 'sent'
        try {
          const parsedUnknown = raw ? (JSON.parse(raw) as unknown) : null
          const parsed =
            parsedUnknown && typeof parsedUnknown === 'object'
              ? (parsedUnknown as Record<string, unknown>)
              : (null as Record<string, unknown> | null)

          const message = parsed && typeof parsed.message === 'object' && parsed.message !== null ? (parsed.message as Record<string, unknown>) : null
          const data = parsed && typeof parsed.data === 'object' && parsed.data !== null ? (parsed.data as Record<string, unknown>) : null

          const candidate =
            // Prefer short messageid for a stable external_id (matches webhook `message.messageid`)
            (typeof parsed?.messageid === 'string' && parsed.messageid) ||
            (typeof message?.messageid === 'string' && message.messageid) ||
            (typeof parsed?.id === 'string' && parsed.id) ||
            (typeof parsed?.messageId === 'string' && parsed.messageId) ||
            (typeof message?.id === 'string' && message.id) ||
            (typeof data?.id === 'string' && data.id) ||
            null

          externalId = candidate
        } catch {
          // ignore JSON parse issues; status still "sent"
        }
      }
    } catch (e) {
      errorText = e instanceof Error ? e.message : 'uazapi_send_failed'
    }

    const patch: Record<string, unknown> = { status }
    if (externalId) patch.external_id = externalId
    if (errorText) patch.metadata = { provider_error: errorText }

    await supabase.from('conversation_messages').update(patch).eq('id', msgId)
  }

  revalidatePath(`/${input.tenantSlug}/inbox`)
}

export async function openOrCreateConversationForContact(input: {
  tenantSlug: string
  contactId: string
  whatsappInstanceId?: string | null
}): Promise<{ conversationId: string }> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(input.tenantSlug)

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .eq('tenant_id', tenantId)
    .eq('id', input.contactId)
    .single()
  if (contactError) throw new Error(contactError.message)
  if (!contact) throw new Error('Contato não encontrado')
  if (!contact.phone?.trim()) throw new Error('Este contato não possui telefone cadastrado.')

  const phone = normalizePhoneWithDefaultBR(contact.phone)?.trim() ?? null
  if (!phone) throw new Error('Este contato não possui telefone cadastrado.')

  let instanceId: string | null = input.whatsappInstanceId?.trim() ? input.whatsappInstanceId!.trim() : null
  if (instanceId) {
    const { data: inst, error: instError } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', instanceId)
      .maybeSingle()
    if (instError) throw new Error(instError.message)
    if (!inst) throw new Error('Instância do WhatsApp inválida para este tenant.')
  } else {
    const { data: inst, error: instError } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (instError) throw new Error(instError.message)
    if (!inst) throw new Error('Nenhuma instância ativa do WhatsApp encontrada.')
    instanceId = inst.id as string
  }

  // Prefer conversation linked to contact_id; fallback to phone match
  const { data: existing, error: existingError } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('whatsapp_instance_id', instanceId)
    .or(`contact_id.eq.${contact.id},contact_phone.eq.${phone}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)
  if (existing?.id) {
    revalidatePath(`/${input.tenantSlug}/inbox`)
    return { conversationId: existing.id as string }
  }

  const now = new Date().toISOString()
  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      whatsapp_instance_id: instanceId,
      contact_id: contact.id,
      contact_phone: phone,
      contact_name: contact.name,
      status: 'open',
      unread_count: 0,
      last_message_at: null,
      ignored: false,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()
  if (createError) throw new Error(createError.message)

  revalidatePath(`/${input.tenantSlug}/inbox`)
  return { conversationId: created.id as string }
}

/** Abre ou cria a conversa e envia a primeira mensagem (WhatsApp). */
export async function startConversationWithFirstMessage(input: {
  tenantSlug: string
  contactId: string
  body: string
  whatsappInstanceId?: string | null
}): Promise<{ conversationId: string }> {
  const body = input.body.trim()
  if (!body) throw new Error('Digite a primeira mensagem.')

  const { conversationId } = await openOrCreateConversationForContact({
    tenantSlug: input.tenantSlug,
    contactId: input.contactId,
    whatsappInstanceId: input.whatsappInstanceId,
  })

  await sendConversationMessage({
    tenantSlug: input.tenantSlug,
    conversationId,
    body,
  })

  return { conversationId }
}


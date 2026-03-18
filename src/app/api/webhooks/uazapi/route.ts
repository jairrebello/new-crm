import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type IncomingWebhook = {
  instanceKey?: string
  instance_id?: string
  instanceId?: string
  from?: string
  phone?: string
  contact?: { name?: string; phone?: string }
  message?: { id?: string; body?: string; text?: string; timestamp?: string | number }
  body?: string
  text?: string
  messageId?: string
  id?: string
  timestamp?: string | number
  event?: string
  type?: string
}

function normalizePhone(raw: string) {
  return raw.replace(/[^\d+]/g, '').trim()
}

function coerceText(payload: IncomingWebhook) {
  return (
    payload.message?.body ??
    payload.message?.text ??
    payload.body ??
    payload.text ??
    ''
  )
}

function coerceExternalId(payload: IncomingWebhook) {
  return payload.message?.id ?? payload.messageId ?? payload.id ?? null
}

function coerceInstanceKey(payload: IncomingWebhook) {
  return payload.instanceKey ?? payload.instance_id ?? payload.instanceId ?? null
}

function coerceFrom(payload: IncomingWebhook) {
  const raw = payload.from ?? payload.phone ?? payload.contact?.phone ?? ''
  return raw ? normalizePhone(raw) : null
}

function coerceContactName(payload: IncomingWebhook) {
  return payload.contact?.name ?? null
}

function coerceTimestamp(payload: IncomingWebhook) {
  const t = payload.message?.timestamp ?? payload.timestamp
  if (!t) return new Date().toISOString()
  if (typeof t === 'number') return new Date(t * 1000).toISOString()
  const n = Number(t)
  if (!Number.isNaN(n)) return new Date(n * 1000).toISOString()
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  const receivedAt = new Date().toISOString()

  let payload: IncomingWebhook | null = null
  try {
    payload = (await request.json()) as IncomingWebhook
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // Legacy field kept for debugging/log context (not used for auth)
  const instanceKey = coerceInstanceKey(payload)
  const fromPhone = coerceFrom(payload)
  const body = coerceText(payload).trim()
  const externalId = coerceExternalId(payload)
  const contactName = coerceContactName(payload)
  const receivedAtTs = coerceTimestamp(payload)
  const eventType = payload.event ?? payload.type ?? 'message'

  // Log early (best-effort; we may not know tenant yet)
  const { data: logRow } = await admin
    .from('webhooks_log')
    .insert({
      provider: 'uazapi',
      event_type: eventType,
      external_id: externalId,
      payload: { ...payload, _legacy_instance_key: instanceKey },
      received_at: receivedAt,
      status: 'received',
    })
    .select('id')
    .single()

  // Simplified auth: only instance token is required.
  // Token can come via header or query param. (Legacy: instanceKey from payload is kept only for logging context.)
  const instanceToken = request.headers.get('x-instance-token') ?? request.nextUrl.searchParams.get('token')

  if (!instanceToken) {
    if (logRow?.id) {
      await admin.from('webhooks_log').update({ status: 'failed', error: 'missing_instance_token' }).eq('id', logRow.id)
    }
    return NextResponse.json({ ok: true })
  }

  const { data: instance, error: instanceError } = await admin
    .from('whatsapp_instances')
    .select('id, tenant_id, instance_token, is_active')
    .eq('provider', 'uazapi')
    .eq('instance_token', instanceToken)
    .single()

  if (instanceError || !instance) {
    if (logRow?.id) {
      await admin
        .from('webhooks_log')
        .update({ status: 'failed', error: 'instance_not_found' })
        .eq('id', logRow.id)
    }
    return NextResponse.json({ ok: true })
  }

  if (!instance.is_active) {
    if (logRow?.id) {
      await admin
        .from('webhooks_log')
        .update({
          tenant_id: instance.tenant_id,
          whatsapp_instance_id: instance.id,
          status: 'failed',
          error: 'instance_inactive',
        })
        .eq('id', logRow.id)
    }
    return NextResponse.json({ ok: true })
  }

  if (!fromPhone || !body) {
    if (logRow?.id) {
      await admin
        .from('webhooks_log')
        .update({
          tenant_id: instance.tenant_id,
          whatsapp_instance_id: instance.id,
          status: 'failed',
          error: 'missing_from_or_body',
        })
        .eq('id', logRow.id)
    }
    return NextResponse.json({ ok: true })
  }

  try {
    // 1) Upsert contact by phone (unique per tenant)
    const { data: existingContact } = await admin
      .from('contacts')
      .select('id, name')
      .eq('tenant_id', instance.tenant_id)
      .eq('phone', fromPhone)
      .maybeSingle()

    let contactId: string | null = existingContact?.id ?? null

    if (!contactId) {
      const { data: createdContact, error: createContactError } = await admin
        .from('contacts')
        .insert({
          tenant_id: instance.tenant_id,
          name: contactName ?? fromPhone,
          phone: fromPhone,
        })
        .select('id')
        .single()

      if (createContactError) throw createContactError
      contactId = createdContact.id
    }

    // 2) Find or create conversation
    const { data: existingConversation } = await admin
      .from('conversations')
      .select('id, unread_count')
      .eq('tenant_id', instance.tenant_id)
      .eq('whatsapp_instance_id', instance.id)
      .eq('contact_phone', fromPhone)
      .maybeSingle()

    let conversationId: string
    if (existingConversation?.id) {
      conversationId = existingConversation.id
      await admin
        .from('conversations')
        .update({
          contact_id: contactId,
          contact_phone: fromPhone,
          contact_name: contactName ?? null,
          last_message_at: receivedAtTs,
          unread_count: (existingConversation.unread_count ?? 0) + 1,
          updated_at: receivedAt,
        })
        .eq('id', conversationId)
    } else {
      const { data: createdConversation, error: createConvError } = await admin
        .from('conversations')
        .insert({
          tenant_id: instance.tenant_id,
          whatsapp_instance_id: instance.id,
          contact_id: contactId,
          contact_phone: fromPhone,
          contact_name: contactName ?? null,
          last_message_at: receivedAtTs,
          unread_count: 1,
          status: 'open',
        })
        .select('id')
        .single()

      if (createConvError) throw createConvError
      conversationId = createdConversation.id
    }

    // 3) Insert message (idempotent-ish if external_id unique per instance)
    const { error: msgError } = await admin.from('conversation_messages').insert({
      tenant_id: instance.tenant_id,
      conversation_id: conversationId,
      whatsapp_instance_id: instance.id,
      direction: 'inbound',
      body,
      external_id: externalId,
      received_at: receivedAtTs,
      status: 'stored',
    })

    if (msgError) {
      // If duplicate external_id, just ignore for MVP
      const msg = typeof msgError === 'object' && msgError && 'message' in msgError ? (msgError as { message?: unknown }).message : undefined
      const dup = String(msg ?? '').toLowerCase().includes('duplicate')
      if (!dup) throw msgError
    }

    if (logRow?.id) {
      await admin
        .from('webhooks_log')
        .update({
          tenant_id: instance.tenant_id,
          whatsapp_instance_id: instance.id,
          processed_at: new Date().toISOString(),
          status: 'processed',
        })
        .eq('id', logRow.id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (logRow?.id) {
      await admin
        .from('webhooks_log')
        .update({
          tenant_id: instance.tenant_id,
          whatsapp_instance_id: instance.id,
          status: 'failed',
          error: err instanceof Error ? err.message : 'unknown_error',
        })
        .eq('id', logRow.id)
    }
    return NextResponse.json({ ok: true })
  }
}


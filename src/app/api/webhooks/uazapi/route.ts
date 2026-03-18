import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhoneWithDefaultBR } from '@/lib/phone'

function describeError(err: unknown) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    const msg = typeof e.message === 'string' ? e.message : undefined
    const code = typeof e.code === 'string' ? e.code : undefined
    const details = typeof e.details === 'string' ? e.details : undefined
    const hint = typeof e.hint === 'string' ? e.hint : undefined
    const parts = [msg, code ? `code=${code}` : null, details ? `details=${details}` : null, hint ? `hint=${hint}` : null]
      .filter(Boolean)
      .join(' | ')
    if (parts) return parts
    try {
      return JSON.stringify(err)
    } catch {
      return 'unknown_error_object'
    }
  }
  return 'unknown_error'
}

function isUniqueViolation(err: unknown): boolean {
  const e = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null
  const code = typeof e?.code === 'string' ? (e.code as string) : null
  if (code === '23505') return true

  const msg = typeof e?.message === 'string' ? (e.message as string) : ''
  const m = msg.toLowerCase()
  return (
    m.includes('duplicate key') ||
    m.includes('unique constraint') ||
    m.includes('violates unique') ||
    m.includes('already exists')
  )
}

type IncomingWebhook = {
  instanceKey?: string
  instance_id?: string
  instanceId?: string
  token?: string
  EventType?: string
  instanceName?: string
  BaseUrl?: string
  chat?: {
    id?: string
    phone?: string
    name?: string
    wa_name?: string
    wa_chatid?: string
    wa_lastMsgTimestamp?: string | number
    wa_lastMessageTextVote?: string
  }
  message?: {
    id?: string
    messageid?: string
    body?: string
    text?: string
    content?: string
    timestamp?: string | number
    messageTimestamp?: string | number
    chatid?: string
    senderName?: string
    sender_pn?: string
    fromMe?: boolean
    track_id?: string
    track_source?: string
  }
  from?: string
  phone?: string
  contact?: { name?: string; phone?: string }
  body?: string
  text?: string
  messageId?: string
  id?: string
  timestamp?: string | number
  event?: string
  type?: string
}

function normalizePhone(raw: string) {
  return normalizePhoneWithDefaultBR(raw)
}

function coerceText(payload: IncomingWebhook) {
  return (
    payload.message?.body ??
    payload.message?.text ??
    payload.message?.content ??
    payload.chat?.wa_lastMessageTextVote ??
    payload.body ??
    payload.text ??
    ''
  )
}

function coerceExternalId(payload: IncomingWebhook) {
  // Uazapi sometimes provides both `id` (prefixed) and `messageid` (short id).
  // We prefer `messageid` to keep a stable external_id across local-send and webhook.
  return payload.message?.messageid ?? payload.message?.id ?? payload.messageId ?? payload.id ?? payload.chat?.id ?? null
}

function coerceInstanceKey(payload: IncomingWebhook) {
  return payload.instanceKey ?? payload.instance_id ?? payload.instanceId ?? null
}

function coerceFrom(payload: IncomingWebhook) {
  const fromMe = Boolean(payload.message?.fromMe)

  // For messages sent from the same WhatsApp account ("fromMe" events),
  // the "sender" is our own number. The chat/contact is the other party.
  // Prefer wa_chatid/chat.phone for fromMe events.
  const raw = fromMe
    ? payload.message?.chatid ??
        payload.chat?.wa_chatid ??
        payload.chat?.phone ??
        payload.chat?.wa_chatid ??
        payload.from ??
        payload.phone ??
        payload.contact?.phone ??
        ''
    : payload.message?.sender_pn ?? payload.chat?.phone ?? payload.chat?.wa_chatid ?? payload.from ?? payload.phone ?? payload.contact?.phone ?? ''

  return raw ? normalizePhone(raw) : null
}

function coerceContactName(payload: IncomingWebhook) {
  const clean = (v: string | null | undefined): string | null => {
    const t = (v ?? '').trim()
    return t.length > 0 ? t : null
  }

  const fromMe = Boolean(payload.message?.fromMe)
  if (fromMe) {
    // Prefer the chat name (other party). senderName might be our own name.
    return clean(payload.chat?.wa_name ?? payload.chat?.name ?? payload.contact?.name ?? null)
  }
  return clean(payload.message?.senderName ?? payload.chat?.wa_name ?? payload.chat?.name ?? payload.contact?.name ?? null)
}

function coerceTimestamp(payload: IncomingWebhook) {
  const t =
    payload.message?.messageTimestamp ??
    payload.message?.timestamp ??
    payload.chat?.wa_lastMsgTimestamp ??
    payload.timestamp
  if (!t) return new Date().toISOString()
  if (typeof t === 'number') {
    // Uazapi uses ms (e.g. 1773842581000). Seconds would be ~1.7e9.
    // Treat values >= 1e11 as milliseconds, else seconds.
    return new Date(t >= 100_000_000_000 ? t : t * 1000).toISOString()
  }
  const n = Number(t)
  if (!Number.isNaN(n)) {
    return new Date(n >= 100_000_000_000 ? n : n * 1000).toISOString()
  }
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
  const eventType = payload.EventType ?? payload.event ?? payload.type ?? 'message'

  const fromMe = Boolean(payload.message?.fromMe)
  const debugFromMeSource =
    fromMe && payload.message?.chatid
      ? 'message.chatid'
      : fromMe && payload.chat?.wa_chatid
        ? 'chat.wa_chatid'
        : fromMe && payload.chat?.phone
          ? 'chat.phone'
          : fromMe
            ? 'fallback_from'
            : payload.message?.sender_pn
              ? 'message.sender_pn'
              : 'fallback_from'

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
  const instanceToken =
    request.headers.get('x-instance-token') ??
    request.nextUrl.searchParams.get('token') ??
    payload.token ??
    null

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
    const { data: existingContactByPhone } = await admin
      .from('contacts')
      .select('id, name')
      .eq('tenant_id', instance.tenant_id)
      .eq('phone', fromPhone)
      .maybeSingle()

    const existingName = existingContactByPhone?.name?.trim() ? existingContactByPhone?.name?.trim() : null
    const resolvedContactName = contactName ?? existingName ?? fromPhone

    const { data: upsertContact, error: upsertContactError } = await admin
      .from('contacts')
      .upsert(
        {
          tenant_id: instance.tenant_id,
          name: resolvedContactName,
          phone: fromPhone,
        },
        { onConflict: 'tenant_id,phone' }
      )
      .select('id')
      .single()

    if (upsertContactError) throw new Error(`upsert_contact_failed: ${upsertContactError.message}`)
    const contactId = upsertContact.id as string

    // 2) Find or create conversation (unique by tenant+instance+contact_id)
    const { data: existingConversation } = await admin
      .from('conversations')
      .select('id')
      .eq('tenant_id', instance.tenant_id)
      .eq('whatsapp_instance_id', instance.id)
      .eq('contact_id', contactId)
      .maybeSingle()

    let conversationId: string
    if (existingConversation?.id) {
      conversationId = existingConversation.id
    } else {
      const { data: createdConversation, error: createConvError } = await admin
        .from('conversations')
        .insert({
          tenant_id: instance.tenant_id,
          whatsapp_instance_id: instance.id,
          contact_id: contactId,
          contact_phone: fromPhone,
          contact_name: resolvedContactName ?? null,
          last_message_at: receivedAtTs,
          unread_count: 0, // we will update after message insert attempt
          status: 'open',
        })
        .select('id')
        .single()

      if (createConvError) {
        // In case of race, re-select the conversation
        if (!isUniqueViolation(createConvError)) throw new Error(`create_conversation_failed: ${createConvError.message}`)

        const { data: existingAfterRace, error: existingAfterRaceError } = await admin
          .from('conversations')
          .select('id')
          .eq('tenant_id', instance.tenant_id)
          .eq('whatsapp_instance_id', instance.id)
          .eq('contact_id', contactId)
          .maybeSingle()

        if (existingAfterRaceError) throw new Error(existingAfterRaceError.message)
        if (!existingAfterRace?.id) throw new Error('conversation_race_failed: conversation not found after unique violation')
        conversationId = existingAfterRace.id as string
      } else {
        conversationId = createdConversation.id as string
      }
    }

    // 3) Insert message (idempotent via external_id unique constraint)
    const direction = fromMe ? 'outbound' : 'inbound'
    const messageStatus = fromMe ? 'sent' : 'stored'
    let messageInserted = true
    let reconciledLocalMessageId: string | null = null
    let reconciliationReason: string | null = null

    // First, attempt idempotency by provider's unique message code (messageid).
    // This avoids duplicates even when race conditions occur or when DB unique indexes aren't enforced yet.
    if (externalId) {
      const { data: existingByExternalId, error: existingByExternalIdError } = await admin
        .from('conversation_messages')
        .select('id')
        .eq('tenant_id', instance.tenant_id)
        .eq('conversation_id', conversationId)
        .eq('whatsapp_instance_id', instance.id)
        .eq('direction', direction)
        .eq('external_id', externalId)
        .limit(1)

      if (existingByExternalIdError) throw new Error(existingByExternalIdError.message)

      const existingId = existingByExternalId?.[0]?.id ?? null
      if (existingId) {
        messageInserted = false
        reconciledLocalMessageId = existingId as string
        reconciliationReason = 'external_id'

        const { error: patchError } = await admin.from('conversation_messages').update({
          status: messageStatus,
          received_at: receivedAtTs,
          sent_at: fromMe ? receivedAtTs : null,
          external_id: externalId,
        }).eq('id', existingId)

        if (patchError) throw patchError
      }
    }

    // If we already saved the message locally (outbound) and the webhook arrived before
    // we could set `external_id`, try to reconcile by body + time window.
    if (fromMe && messageInserted) {
      const receivedAtMs = new Date(receivedAtTs).getTime()
      // Uazapi timestamps may drift slightly vs our local insert time; allow a wider window.
      const windowStartIso = new Date(receivedAtMs - 10 * 60 * 1000).toISOString()

      const trackId = typeof payload.message?.track_id === 'string' && payload.message?.track_id.trim() ? payload.message?.track_id.trim() : null

      // Step 1: if provider echoed our track_id, reconcile by local message id.
      if (trackId) {
        const { data: patched, error: patchError } = await admin
          .from('conversation_messages')
          .update({
            status: messageStatus,
            external_id: externalId,
            received_at: receivedAtTs,
            sent_at: receivedAtTs,
          })
          .eq('id', trackId)
          .eq('direction', direction)
          .eq('conversation_id', conversationId)
          .eq('whatsapp_instance_id', instance.id)
          .select('id')
          .maybeSingle()

        if (patchError) {
          // If external_id update hits unique constraint (already reconciled), ignore and keep going.
          if (!isUniqueViolation(patchError)) throw patchError
        }

        if (patched?.id) {
          messageInserted = false
          reconciledLocalMessageId = patched.id as string
          reconciliationReason = 'track_id'
        }
      }

      // Step 2: fallback reconcile by body+time window.
      const { data: pendingLocal } = await admin
        .from('conversation_messages')
        .select('id')
        .eq('tenant_id', instance.tenant_id)
        .eq('conversation_id', conversationId)
        .eq('whatsapp_instance_id', instance.id)
        .eq('direction', direction)
        .eq('body', body)
        .gte('created_at', windowStartIso)
        .order('created_at', { ascending: false })
        .limit(1)

      const localId = pendingLocal?.[0]?.id ?? null
      if (localId) {
        messageInserted = false
        reconciliationReason ??= 'body_window'
        reconciledLocalMessageId = localId
        const patch: Record<string, unknown> = {
          status: messageStatus,
          external_id: externalId,
          received_at: receivedAtTs,
          sent_at: receivedAtTs,
        }

        const { error: patchError } = await admin.from('conversation_messages').update(patch).eq('id', localId)
        if (patchError) throw patchError
      }
    }

    if (messageInserted) {
      const { error: msgError } = await admin.from('conversation_messages').insert({
        tenant_id: instance.tenant_id,
        conversation_id: conversationId,
        whatsapp_instance_id: instance.id,
        direction,
        body,
        external_id: externalId,
        received_at: receivedAtTs,
        sent_at: fromMe ? receivedAtTs : null,
        status: messageStatus,
      })

      if (msgError) {
        if (isUniqueViolation(msgError)) {
          messageInserted = false
        } else {
          throw msgError
        }
      }
    }

    // 4) Update conversation counters/timestamps only if message was newly inserted
    const { data: convNow, error: convNowError } = await admin
      .from('conversations')
      .select('id, unread_count')
      .eq('id', conversationId)
      .maybeSingle()

    if (convNowError) throw new Error(`read_conversation_failed: ${convNowError.message}`)
    const currentUnread = convNow?.unread_count ?? 0
    const unreadNext = fromMe ? currentUnread : currentUnread + (messageInserted ? 1 : 0)

    const { error: updConvError } = await admin
      .from('conversations')
      .update({
        contact_id: contactId,
        contact_phone: fromPhone,
        contact_name: resolvedContactName ?? null,
        last_message_at: receivedAtTs,
        unread_count: unreadNext,
        updated_at: receivedAt,
      })
      .eq('id', conversationId)

    if (updConvError) throw new Error(`update_conversation_failed: ${updConvError.message}`)

    if (logRow?.id) {
      const debugPayload: Record<string, unknown> = payload ? (payload as unknown as Record<string, unknown>) : {}
      debugPayload._debug = {
        fromMe,
        fromPhone,
        debugFromMeSource,
        contactName,
        resolvedContactName,
        messageChatid: payload.message?.chatid ?? null,
        messageSenderPn: payload.message?.sender_pn ?? null,
        messageFromMe: payload.message?.fromMe ?? null,
        chatWaChatid: payload.chat?.wa_chatid ?? null,
        chatPhone: payload.chat?.phone ?? null,
        contactId,
        conversationId,
        messageInserted,
        reconciledLocalMessageId,
        reconciliationReason,
        messageTrackId: payload.message?.track_id ?? null,
        messageTrackSource: payload.message?.track_source ?? null,
      }

      await admin
        .from('webhooks_log')
        .update({
          tenant_id: instance.tenant_id,
          whatsapp_instance_id: instance.id,
          processed_at: new Date().toISOString(),
          status: 'processed',
          payload: debugPayload,
        })
        .eq('id', logRow.id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (logRow?.id) {
      const debugPayload: Record<string, unknown> = payload ? (payload as unknown as Record<string, unknown>) : {}
      debugPayload._debug = {
        fromMe,
        fromPhone,
        debugFromMeSource,
        messageChatid: payload.message?.chatid ?? null,
        messageSenderPn: payload.message?.sender_pn ?? null,
        contactId: null,
        conversationId: null,
        error: describeError(err),
      }

      await admin
        .from('webhooks_log')
        .update({
          tenant_id: instance.tenant_id,
          whatsapp_instance_id: instance.id,
          status: 'failed',
          error: describeError(err),
          payload: debugPayload,
        })
        .eq('id', logRow.id)
    }
    return NextResponse.json({ ok: true })
  }
}


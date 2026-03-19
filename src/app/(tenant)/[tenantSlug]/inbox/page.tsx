import { getContactTagsByContactIds } from '@/app/actions/contacts'
import { listConversationsFiltered, getConversationMessages } from '@/app/actions/inbox'
import { InboxPageClient } from '@/components/inbox/inbox-page'

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>
  searchParams?: Promise<{ status?: string; unread?: string; mine?: string; conversation?: string; ignored?: string }>
}) {
  const { tenantSlug } = await params

  const sp = (await searchParams) ?? {}
  const status =
    sp.status === 'open' || sp.status === 'waiting' || sp.status === 'closed' ? sp.status : undefined
  const unreadOnly = sp.unread === '1'
  const assignedToMe = sp.mine === '1'
  const ignoredOnly = sp.ignored === '1'
  const requestedConversationId = typeof sp.conversation === 'string' && sp.conversation.trim() ? sp.conversation.trim() : null

  const conversations = await listConversationsFiltered(tenantSlug, {
    status,
    unreadOnly,
    assignedToMe,
    ignoredOnly,
  })
  const contactIds = Array.from(
    new Set(conversations.map((c) => c.contact_id).filter((id): id is string => Boolean(id)))
  )
  const contactTagMap = await getContactTagsByContactIds(tenantSlug, contactIds)
  const initialConversationId =
    (requestedConversationId && conversations.some((c) => c.id === requestedConversationId) ? requestedConversationId : null) ??
    conversations[0]?.id ??
    null
  const initialMessages = initialConversationId ? await getConversationMessages(initialConversationId) : []

  return (
    <InboxPageClient
      tenantSlug={tenantSlug}
      conversations={conversations}
      contactTagMap={contactTagMap}
      initialConversationId={initialConversationId}
      initialMessages={initialMessages}
      filters={{
        status: status ?? 'all',
        unreadOnly,
        assignedToMe,
        ignoredOnly,
      }}
    />
  )
}


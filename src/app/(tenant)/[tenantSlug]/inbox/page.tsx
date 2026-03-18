import { listConversationsFiltered, getConversationMessages } from '@/app/actions/inbox'
import { InboxPageClient } from '@/components/inbox/inbox-page'

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>
  searchParams?: Promise<{ status?: string; unread?: string; mine?: string }>
}) {
  const { tenantSlug } = await params

  const sp = (await searchParams) ?? {}
  const status =
    sp.status === 'open' || sp.status === 'waiting' || sp.status === 'closed' ? sp.status : undefined
  const unreadOnly = sp.unread === '1'
  const assignedToMe = sp.mine === '1'

  const conversations = await listConversationsFiltered(tenantSlug, {
    status,
    unreadOnly,
    assignedToMe,
  })
  const initialConversationId = conversations[0]?.id ?? null
  const initialMessages = initialConversationId ? await getConversationMessages(initialConversationId) : []

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Caixa de entrada</h2>
      <InboxPageClient
        tenantSlug={tenantSlug}
        conversations={conversations}
        initialConversationId={initialConversationId}
        initialMessages={initialMessages}
        filters={{
          status: status ?? 'all',
          unreadOnly,
          assignedToMe,
        }}
      />
    </div>
  )
}


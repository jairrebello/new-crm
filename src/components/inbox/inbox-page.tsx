'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { Conversation, ConversationMessage } from '@/app/actions/inbox'
import { getConversationMessages, markConversationRead, sendConversationMessage, updateConversation } from '@/app/actions/inbox'
import type { TenantMemberOption } from '@/app/actions/members'
import { listTenantMemberOptions } from '@/app/actions/members'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Props = {
  tenantSlug: string
  conversations: Conversation[]
  initialConversationId: string | null
  initialMessages: ConversationMessage[]
  filters: {
    status: 'all' | 'open' | 'waiting' | 'closed'
    unreadOnly: boolean
    assignedToMe: boolean
  }
}

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleString('pt-BR')
  } catch {
    return ts
  }
}

export function InboxPageClient({ tenantSlug, conversations, initialConversationId, initialMessages, filters }: Props) {
  const [activeId, setActiveId] = useState<string | null>(initialConversationId)
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [members, setMembers] = useState<TenantMemberOption[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!activeId) return
      setError(null)
      try {
        const data = await getConversationMessages(activeId)
        if (!cancelled) setMessages(data)
        startTransition(async () => {
          try {
            await markConversationRead(activeId, tenantSlug)
          } catch {
            // ignore for MVP
          }
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar mensagens.')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [activeId, tenantSlug, startTransition])

  useEffect(() => {
    let cancelled = false
    async function loadMembers() {
      if (membersLoaded) return
      try {
        const data = await listTenantMemberOptions(tenantSlug)
        if (!cancelled) {
          setMembers(data)
          setMembersLoaded(true)
        }
      } catch {
        if (!cancelled) setMembersLoaded(true)
      }
    }
    loadMembers()
    return () => {
      cancelled = true
    }
  }, [tenantSlug, membersLoaded])

  function handleSend() {
    if (!activeId) return
    const body = draft.trim()
    if (!body) return

    setError(null)
    setDraft('')

    // optimistic
    const optimistic: ConversationMessage = {
      id: `optimistic-${Date.now()}`,
      conversation_id: activeId,
      direction: 'outbound',
      body,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])

    startTransition(async () => {
      try {
        await sendConversationMessage({ tenantSlug, conversationId: activeId, body })
        const refreshed = await getConversationMessages(activeId)
        setMessages(refreshed)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar mensagem.')
      }
    })
  }

  function setAssignee(userId: string | null) {
    if (!activeId) return
    startTransition(async () => {
      try {
        await updateConversation({ tenantSlug, conversationId: activeId, fields: { assigned_user_id: userId } })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao atribuir conversa.')
      }
    })
  }

  function setStatus(status: 'open' | 'waiting' | 'closed') {
    if (!activeId) return
    startTransition(async () => {
      try {
        await updateConversation({ tenantSlug, conversationId: activeId, fields: { status } })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao atualizar status.')
      }
    })
  }

  const assigneeValue = activeConversation?.assigned_user_id ?? 'none'
  const activeStatus = (activeConversation?.status as 'open' | 'waiting' | 'closed' | undefined) ?? 'open'

  return (
    <div className="h-[calc(100vh-140px)] rounded-lg border bg-white shadow-sm overflow-hidden">
      <div className="grid grid-cols-12 h-full">
        {/* Left: conversations */}
        <aside className="col-span-4 border-r bg-white">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Conversas</div>
                <div className="text-xs text-muted-foreground">WhatsApp (texto) — MVP</div>
              </div>
              <a
                className="text-xs text-blue-700 hover:underline"
                href={`/${tenantSlug}/inbox?status=${filters.status === 'all' ? '' : filters.status}&unread=${filters.unreadOnly ? '1' : '0'}&mine=${filters.assignedToMe ? '1' : '0'}`}
              >
                Atualizar
              </a>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <a
                className={cn(
                  'text-xs rounded-full border px-2 py-0.5',
                  filters.status === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'
                )}
                href={`/${tenantSlug}/inbox`}
              >
                Todas
              </a>
              {(['open', 'waiting', 'closed'] as const).map((s) => (
                <a
                  key={s}
                  className={cn(
                    'text-xs rounded-full border px-2 py-0.5',
                    filters.status === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'
                  )}
                  href={`/${tenantSlug}/inbox?status=${s}${filters.unreadOnly ? '&unread=1' : ''}${filters.assignedToMe ? '&mine=1' : ''}`}
                >
                  {s === 'open' ? 'Abertas' : s === 'waiting' ? 'Aguardando' : 'Fechadas'}
                </a>
              ))}
              <a
                className={cn(
                  'text-xs rounded-full border px-2 py-0.5',
                  filters.unreadOnly ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'
                )}
                href={`/${tenantSlug}/inbox?${filters.status !== 'all' ? `status=${filters.status}&` : ''}unread=${filters.unreadOnly ? '0' : '1'}${filters.assignedToMe ? '&mine=1' : ''}`}
              >
                Não lidas
              </a>
              <a
                className={cn(
                  'text-xs rounded-full border px-2 py-0.5',
                  filters.assignedToMe ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'
                )}
                href={`/${tenantSlug}/inbox?${filters.status !== 'all' ? `status=${filters.status}&` : ''}${filters.unreadOnly ? 'unread=1&' : ''}mine=${filters.assignedToMe ? '0' : '1'}`}
              >
                Minhas
              </a>
            </div>
          </div>
          <div className="overflow-y-auto h-[calc(100%-56px)]">
            {conversations.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Nenhuma conversa ainda.</div>
            ) : (
              <div className="divide-y">
                {conversations.map((c) => {
                  const label = c.contact_name ?? c.contact_phone ?? 'Contato'
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={cn(
                        'w-full text-left px-3 py-3 hover:bg-gray-50 transition-colors',
                        activeId === c.id && 'bg-blue-50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm truncate">{label}</div>
                        {c.unread_count > 0 && (
                          <span className="text-xs rounded-full bg-blue-600 text-white px-2 py-0.5">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between gap-2">
                        <span className="truncate">{c.contact_phone ?? '—'}</span>
                        {c.last_message_at && <span className="shrink-0">{new Date(c.last_message_at).toLocaleDateString('pt-BR')}</span>}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>{c.status === 'open' ? 'Aberta' : c.status === 'waiting' ? 'Aguardando' : 'Fechada'}</span>
                        <span className="truncate max-w-[120px]">
                          {c.assigned_user_id ? 'Atribuída' : 'Não atribuída'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Center: thread */}
        <section className="col-span-5 flex flex-col">
          <div className="p-3 border-b">
            <div className="text-sm font-semibold truncate">
              {activeConversation ? (activeConversation.contact_name ?? activeConversation.contact_phone ?? 'Conversa') : 'Selecione uma conversa'}
            </div>
            <div className="text-xs text-muted-foreground truncate">{activeConversation?.contact_phone ?? ''}</div>

            {activeConversation && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Select
                    value={assigneeValue}
                    onValueChange={(v) => setAssignee(v === 'none' ? null : v)}
                    disabled={pending}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Atribuir..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não atribuída</SelectItem>
                      {members.map((m) => {
                        const label = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email
                        return (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {label}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                  <Select
                    value={activeStatus}
                    onValueChange={(v) => {
                      if (v === 'open' || v === 'waiting' || v === 'closed') setStatus(v)
                    }}
                    disabled={pending}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Aberta</SelectItem>
                      <SelectItem value="waiting">Aguardando</SelectItem>
                      <SelectItem value="closed">Fechada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {!activeConversation ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Escolha uma conversa para ver as mensagens.
              </div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem mensagens ainda.</div>
            ) : (
              <div className="grid gap-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[85%] rounded-lg px-3 py-2 text-sm border',
                      m.direction === 'outbound'
                        ? 'ml-auto bg-blue-600 text-white border-blue-600'
                        : 'mr-auto bg-white text-gray-900 border-gray-200'
                    )}
                  >
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className={cn('mt-1 text-[10px] opacity-80', m.direction === 'outbound' ? 'text-white/80' : 'text-muted-foreground')}>
                      {formatTime(m.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t bg-white">
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={activeConversation ? 'Digite uma mensagem...' : 'Selecione uma conversa...'}
                disabled={!activeConversation}
                className="min-h-12"
              />
              <Button onClick={handleSend} disabled={!activeConversation || pending || !draft.trim()}>
                Enviar
              </Button>
            </div>
          </div>
        </section>

        {/* Right: context */}
        <aside className="col-span-3 border-l bg-white">
          <div className="p-3 border-b">
            <div className="text-sm font-semibold">Contexto</div>
            <div className="text-xs text-muted-foreground">Contato / Negócios</div>
          </div>
          <div className="p-3 grid gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Contato</div>
              <div className="mt-1 font-medium">{activeConversation?.contact_name ?? '—'}</div>
              <div className="text-muted-foreground">{activeConversation?.contact_phone ?? ''}</div>
            </div>

            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Próximo passo (fase 2): listar deals vinculados ao contato e permitir criar/vincular deal direto do inbox.
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}


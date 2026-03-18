'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { Conversation, ConversationContext, ConversationMessage } from '@/app/actions/inbox'
import {
  createDealFromInbox,
  getConversationContext,
  getConversationMessages,
  markConversationRead,
  openOrCreateConversationForContact,
  reconcileConversationOutboundStatuses,
  sendConversationMessage,
  updateConversation,
} from '@/app/actions/inbox'
import type { TenantMemberOption } from '@/app/actions/members'
import { listTenantMemberOptions } from '@/app/actions/members'
import type { Contact } from '@/app/actions/contacts'
import { listContacts } from '@/app/actions/contacts'
import type { WhatsAppInstance } from '@/app/actions/whatsapp'
import { listWhatsAppInstances } from '@/app/actions/whatsapp'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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
    ignoredOnly: boolean
  }
}

function inboxListUrl(
  tenantSlug: string,
  f: {
    status: 'all' | 'open' | 'waiting' | 'closed'
    unreadOnly: boolean
    assignedToMe: boolean
    ignoredOnly: boolean
  },
  conversationId?: string | null
) {
  const p = new URLSearchParams()
  if (f.status !== 'all') p.set('status', f.status)
  if (f.unreadOnly) p.set('unread', '1')
  if (f.assignedToMe) p.set('mine', '1')
  if (f.ignoredOnly) p.set('ignored', '1')
  if (conversationId) p.set('conversation', conversationId)
  const s = p.toString()
  return `/${tenantSlug}/inbox${s ? `?${s}` : ''}`
}

const timeZoneBR = 'America/Sao_Paulo'

function formatDateTimeBR(ts: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: timeZoneBR, dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts))
  } catch {
    return ts
  }
}

function formatDateBR(ts: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: timeZoneBR, dateStyle: 'medium' }).format(new Date(ts))
  } catch {
    return ts
  }
}

  function formatOutboundStatus(m: ConversationMessage) {
  const s = m.status ?? 'stored'
  if (s === 'failed') return 'Falhou'
  if (s === 'read') return 'Lida'
  if (s === 'delivered') return 'Entregue'
  if (s === 'sent') return 'Enviada'
  return 'Enviando...'
}

export function InboxPageClient({ tenantSlug, conversations, initialConversationId, initialMessages, filters }: Props) {
  const [activeId, setActiveId] = useState<string | null>(initialConversationId)
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [members, setMembers] = useState<TenantMemberOption[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const lastReconcileRef = useRef<Record<string, number>>({})
  const [context, setContext] = useState<ConversationContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [newDealOpen, setNewDealOpen] = useState(false)
  const [newDealTitle, setNewDealTitle] = useState('')
  const [newDealValue, setNewDealValue] = useState('')
  const [newDealPriority, setNewDealPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [newConversationOpen, setNewConversationOpen] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<Contact[]>([])
  const [contactSearching, setContactSearching] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [instances, setInstances] = useState<WhatsAppInstance[]>([])
  const [instancesLoaded, setInstancesLoaded] = useState(false)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)

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
        setContextLoading(true)
        const ctx = await getConversationContext(tenantSlug, activeId)
        if (!cancelled) setContext(ctx)

        // Reconcile delivery/read status in background (non-blocking + throttled)
        const last = lastReconcileRef.current[activeId] ?? 0
        const now = Date.now()
        if (now - last > 15_000) {
          lastReconcileRef.current[activeId] = now
          startTransition(async () => {
            try {
              await reconcileConversationOutboundStatuses(activeId)
              const refreshed = await getConversationMessages(activeId)
              if (!cancelled) setMessages(refreshed)
            } catch {
              // ignore reconcile errors
            }
          })
        }

        startTransition(async () => {
          try {
            await markConversationRead(activeId, tenantSlug)
          } catch {
            // ignore for MVP
          }
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar mensagens.')
      } finally {
        if (!cancelled) setContextLoading(false)
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

  useEffect(() => {
    let cancelled = false
    async function loadInstances() {
      if (instancesLoaded) return
      try {
        const data = await listWhatsAppInstances(tenantSlug)
        if (!cancelled) {
          setInstances(data.filter((x) => x.is_active))
          setInstancesLoaded(true)
        }
      } catch {
        if (!cancelled) setInstancesLoaded(true)
      }
    }
    loadInstances()
    return () => {
      cancelled = true
    }
  }, [tenantSlug, instancesLoaded])

  useEffect(() => {
    let cancelled = false
    const q = contactQuery.trim()
    if (!newConversationOpen) return

    if (!q) {
      setContactResults([])
      return
    }

    setContactSearching(true)
    const t = setTimeout(() => {
      ;(async () => {
        try {
          const data = await listContacts(tenantSlug, { q })
          if (!cancelled) setContactResults(data)
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao buscar contatos.')
        } finally {
          if (!cancelled) setContactSearching(false)
        }
      })()
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [tenantSlug, contactQuery, newConversationOpen])

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
      status: 'stored',
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

  function setIgnored(ignored: boolean) {
    if (!activeId) return
    startTransition(async () => {
      try {
        await updateConversation({ tenantSlug, conversationId: activeId, fields: { ignored } })
        if (ignored) {
          window.location.href = inboxListUrl(tenantSlug, { ...filters, ignoredOnly: false })
        } else {
          window.location.href = inboxListUrl(tenantSlug, { ...filters, ignoredOnly: true })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao atualizar conversa.')
      }
    })
  }

  function openNewDeal() {
    const label = context?.contact?.name ?? activeConversation?.contact_name ?? activeConversation?.contact_phone ?? ''
    setNewDealTitle(label ? `Conversa com ${label}` : '')
    setNewDealValue('')
    setNewDealPriority('medium')
    setNewDealOpen(true)
  }

  function openNewConversation() {
    setError(null)
    setContactQuery('')
    setContactResults([])
    setSelectedContactId(null)
    setSelectedInstanceId(instances[0]?.id ?? null)
    setNewConversationOpen(true)
  }

  function handleCreateConversation() {
    if (!selectedContactId) {
      setError('Selecione um contato.')
      return
    }
    if (!selectedInstanceId) {
      setError('Selecione uma instância do WhatsApp.')
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        const { conversationId } = await openOrCreateConversationForContact({
          tenantSlug,
          contactId: selectedContactId,
          whatsappInstanceId: selectedInstanceId,
        })
        // Recarrega a página para trazer a conversa na lista e abrir já selecionada
        window.location.href = inboxListUrl(tenantSlug, { ...filters, ignoredOnly: false }, conversationId)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao iniciar conversa.')
      }
    })
  }

  function handleCreateDeal() {
    if (!context?.contact?.id) {
      setError('Contato não encontrado para esta conversa.')
      return
    }
    const title = newDealTitle.trim()
    if (!title) {
      setError('Informe o título do negócio.')
      return
    }
    const value = newDealValue.trim() ? Number(newDealValue) : 0
    if (Number.isNaN(value) || value < 0) {
      setError('Valor inválido.')
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await createDealFromInbox({
          tenantSlug,
          contactId: context.contact!.id,
          title,
          dealValue: value,
          priority: newDealPriority,
        })
        const refreshed = await getConversationContext(tenantSlug, activeId!)
        setContext(refreshed)
        setNewDealOpen(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao criar negócio.')
      }
    })
  }

  const assigneeValue = activeConversation?.assigned_user_id ?? 'none'
  const activeStatus = (activeConversation?.status as 'open' | 'waiting' | 'closed' | undefined) ?? 'open'

  return (
    <div className="h-[calc(100vh-140px)] rounded-lg border bg-white shadow-sm overflow-hidden">
      <div className="grid grid-cols-12 h-full">
        {/* Left: conversations */}
        <aside className="col-span-4 border-r bg-white flex flex-col h-full min-h-0">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Conversas</div>
                <div className="text-xs text-muted-foreground">
                  {filters.ignoredOnly
                    ? 'Ignoradas — não aparecem na caixa principal'
                    : 'WhatsApp (texto) — MVP'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={openNewConversation} disabled={pending}>
                  Nova conversa
                </Button>
                <a
                  className="text-xs text-blue-700 hover:underline"
                  href={inboxListUrl(tenantSlug, filters)}
                >
                  Atualizar
                </a>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <a
                className={cn(
                  'text-xs rounded-full border px-2 py-0.5',
                  filters.status === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'
                )}
                href={inboxListUrl(tenantSlug, {
                  status: 'all',
                  unreadOnly: false,
                  assignedToMe: false,
                  ignoredOnly: filters.ignoredOnly,
                })}
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
                  href={inboxListUrl(tenantSlug, { ...filters, status: s })}
                >
                  {s === 'open' ? 'Abertas' : s === 'waiting' ? 'Aguardando' : 'Fechadas'}
                </a>
              ))}
              <a
                className={cn(
                  'text-xs rounded-full border px-2 py-0.5',
                  filters.unreadOnly ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'
                )}
                href={inboxListUrl(tenantSlug, { ...filters, unreadOnly: !filters.unreadOnly })}
              >
                Não lidas
              </a>
              <a
                className={cn(
                  'text-xs rounded-full border px-2 py-0.5',
                  filters.assignedToMe ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'
                )}
                href={inboxListUrl(tenantSlug, {
                  ...filters,
                  assignedToMe: !filters.assignedToMe,
                })}
              >
                Minhas
              </a>
              <a
                className={cn(
                  'text-xs rounded-full border px-2 py-0.5',
                  filters.ignoredOnly ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'
                )}
                href={inboxListUrl(tenantSlug, { ...filters, ignoredOnly: !filters.ignoredOnly })}
              >
                {filters.ignoredOnly ? 'Caixa principal' : 'Ignoradas'}
              </a>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {conversations.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                {filters.ignoredOnly ? 'Nenhuma conversa ignorada.' : 'Nenhuma conversa ainda.'}
              </div>
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
                        {c.last_message_at && <span className="shrink-0">{formatDateBR(c.last_message_at)}</span>}
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
        <section className="col-span-5 flex flex-col h-full min-h-0">
          <div className="p-3 border-b">
            <div className="text-sm font-semibold truncate">
              {activeConversation ? (activeConversation.contact_name ?? activeConversation.contact_phone ?? 'Conversa') : 'Selecione uma conversa'}
            </div>
            <div className="text-xs text-muted-foreground truncate">{activeConversation?.contact_phone ?? ''}</div>

            {activeConversation && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
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
                {!filters.ignoredOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground shrink-0"
                    disabled={pending}
                    title="Ocultar da caixa principal (ex.: contato pessoal)"
                    onClick={() => setIgnored(true)}
                  >
                    Ignorar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={pending}
                    onClick={() => setIgnored(false)}
                  >
                    Deixar de ignorar
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-3 bg-gray-50">
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
                      <span>{formatDateTimeBR(m.created_at)}</span>
                      {m.direction === 'outbound' && <span className="ml-2">• {formatOutboundStatus(m)}</span>}
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
              <div className="mt-1 font-medium">
                {contextLoading ? 'Carregando...' : (context?.contact?.name ?? activeConversation?.contact_name ?? '—')}
              </div>
              <div className="text-muted-foreground">
                {context?.contact?.phone ?? activeConversation?.contact_phone ?? ''}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Negócios</div>
                  <div className="text-sm font-medium">Deals do contato</div>
                </div>
                <Button size="sm" variant="outline" disabled={!activeConversation || pending} onClick={openNewDeal}>
                  Criar deal
                </Button>
              </div>

              <div className="mt-3 grid gap-2">
                {!activeConversation ? (
                  <div className="text-xs text-muted-foreground">Selecione uma conversa.</div>
                ) : contextLoading ? (
                  <div className="text-xs text-muted-foreground">Carregando deals...</div>
                ) : (context?.deals?.length ?? 0) === 0 ? (
                  <div className="text-xs text-muted-foreground">Nenhum deal vinculado a este contato.</div>
                ) : (
                  context!.deals.slice(0, 10).map((d) => (
                    <div key={d.id} className="rounded-lg border px-2.5 py-2">
                      <div className="text-sm font-medium line-clamp-2">{d.title}</div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="capitalize">{d.status}</span>
                        <span>R$ {Number(d.deal_value ?? 0).toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={newDealOpen} onOpenChange={setNewDealOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar deal</DialogTitle>
            <DialogDescription>O negócio será vinculado ao contato desta conversa.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Título</label>
              <Input value={newDealTitle} onChange={(e) => setNewDealTitle(e.target.value)} placeholder="Ex: Renovação" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Valor (R$)</label>
                <Input inputMode="decimal" value={newDealValue} onChange={(e) => setNewDealValue(e.target.value)} placeholder="0" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Prioridade</label>
                <Select value={newDealPriority} onValueChange={(v) => {
                  if (v === 'low' || v === 'medium' || v === 'high') setNewDealPriority(v)
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="low">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setNewDealOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending || !newDealTitle.trim()} onClick={handleCreateDeal}>
              {pending ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Iniciar nova conversa</DialogTitle>
            <DialogDescription>Selecione um contato cadastrado e a instância do WhatsApp.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Instância</label>
              <Select value={selectedInstanceId ?? 'none'} onValueChange={(v) => setSelectedInstanceId(v === 'none' ? null : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione...</SelectItem>
                  {instances.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {instancesLoaded && instances.length === 0 && (
                <div className="text-xs text-muted-foreground">Nenhuma instância ativa encontrada. Cadastre em Configurações.</div>
              )}
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Contato</label>
              <Input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Buscar por nome, e-mail ou telefone..."
              />
              <div className="max-h-[220px] overflow-y-auto rounded-lg border bg-white">
                {!contactQuery.trim() ? (
                  <div className="p-3 text-xs text-muted-foreground">Digite para buscar.</div>
                ) : contactSearching ? (
                  <div className="p-3 text-xs text-muted-foreground">Buscando...</div>
                ) : contactResults.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">Nenhum contato encontrado.</div>
                ) : (
                  <div className="divide-y">
                    {contactResults.slice(0, 20).map((c) => {
                      const isSelected = selectedContactId === c.id
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => setSelectedContactId(c.id)}
                          className={cn(
                            'w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors',
                            isSelected && 'bg-blue-50'
                          )}
                        >
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                            <span className="truncate">{c.phone ?? 'Sem telefone'}</span>
                            <span className="truncate">{c.email ?? ''}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Dica: para iniciar, o contato precisa ter telefone cadastrado.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setNewConversationOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || !selectedContactId || !selectedInstanceId}
              onClick={handleCreateConversation}
            >
              {pending ? 'Iniciando...' : 'Iniciar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


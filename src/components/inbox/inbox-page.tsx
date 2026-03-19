'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Tag } from '@/app/actions/contacts'
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
import { EditContactDialog } from '@/components/contacts/edit-contact-dialog'
import { ChevronDownIcon, MessageCircleIcon, PlusIcon, SearchIcon } from 'lucide-react'

type Props = {
  tenantSlug: string
  conversations: Conversation[]
  contactTagMap: Record<string, Tag[]>
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

function formatRelativeShort(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'ontem'
  if (days < 7) return `${days}d`
  return formatDateBR(iso)
}

function contactInitials(name: string | null, phone: string | null) {
  const n = (name ?? '').trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    const a = parts[0]?.[0] ?? ''
    const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '')
    return (a + b).toUpperCase().slice(0, 2) || '?'
  }
  const p = (phone ?? '').replace(/\D/g, '')
  return p.slice(-2) || '?'
}

const AVATAR_PALETTES = [
  'bg-sky-100 text-sky-800 ring-sky-200/80',
  'bg-emerald-100 text-emerald-800 ring-emerald-200/80',
  'bg-amber-100 text-amber-900 ring-amber-200/80',
  'bg-violet-100 text-violet-800 ring-violet-200/80',
  'bg-rose-100 text-rose-800 ring-rose-200/80',
  'bg-cyan-100 text-cyan-800 ring-cyan-200/80',
]

function avatarPaletteClass(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length]
}

function messageDayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yst = new Date(today)
  yst.setDate(yst.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === yst.toDateString()) return 'Ontem'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: timeZoneBR,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(d)
  } catch {
    return formatDateBR(iso)
  }
}

function groupMessagesByDay(messages: ConversationMessage[]) {
  const out: { label: string; items: ConversationMessage[] }[] = []
  let lastKey = ''
  for (const m of messages) {
    const key = new Date(m.created_at).toDateString()
    const label = messageDayLabel(m.created_at)
    if (key !== lastKey) {
      lastKey = key
      out.push({ label, items: [m] })
    } else {
      out[out.length - 1].items.push(m)
    }
  }
  return out
}

function TagPill({ tag, small }: { tag: Tag; small?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-[7rem] truncate rounded-full border border-black/5 px-2 font-medium text-gray-800 shadow-sm',
        small ? 'py-0.5 text-[10px]' : 'py-0.5 text-xs'
      )}
      style={{ backgroundColor: tag.color ?? '#e0f2fe' }}
      title={tag.name}
    >
      {tag.name}
    </span>
  )
}

  function formatOutboundStatus(m: ConversationMessage) {
  const s = m.status ?? 'stored'
  if (s === 'failed') return 'Falhou'
  if (s === 'read') return 'Lida'
  if (s === 'delivered') return 'Entregue'
  if (s === 'sent') return 'Enviada'
  return 'Enviando...'
}

export function InboxPageClient({
  tenantSlug,
  conversations,
  contactTagMap,
  initialConversationId,
  initialMessages,
  filters,
}: Props) {
  const router = useRouter()
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
  const [listSearch, setListSearch] = useState('')
  const [openProfile, setOpenProfile] = useState(true)
  const [openNotes, setOpenNotes] = useState(false)
  const [openDeals, setOpenDeals] = useState(true)
  const [editTagsOpen, setEditTagsOpen] = useState(false)

  const filteredConversations = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => {
      const name = (c.contact_name ?? '').toLowerCase()
      const phone = (c.contact_phone ?? '').toLowerCase()
      return name.includes(q) || phone.includes(q)
    })
  }, [conversations, listSearch])

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
  const chatTitle =
    activeConversation?.contact_name ?? activeConversation?.contact_phone ?? 'Conversa'
  const messageGroups = useMemo(() => groupMessagesByDay(messages), [messages])

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-[#f4f6f9] shadow-sm">
      <div className="grid min-h-[560px] flex-1 grid-cols-12 gap-0">
        {/* Coluna esquerda — lista estilo CRM */}
        <aside className="col-span-12 flex min-h-0 flex-col border-b border-gray-200/80 bg-[#f8f9fb] lg:col-span-4 lg:border-b-0 lg:border-r">
          <div className="shrink-0 space-y-3 border-b border-gray-200/60 bg-[#f8f9fb] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h1 className="text-base font-semibold tracking-tight text-gray-900">Caixa de entrada</h1>
                <p className="text-xs text-gray-500">
                  {filters.ignoredOnly ? 'Conversas ignoradas' : 'WhatsApp · mensagens'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" className="h-8 bg-[#3b82f6] text-white hover:bg-[#2563eb]" onClick={openNewConversation} disabled={pending}>
                  <PlusIcon className="mr-1 size-3.5" />
                  Nova
                </Button>
                <a
                  href={inboxListUrl(tenantSlug, filters)}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Atualizar
                </a>
              </div>
            </div>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Pesquise seus contatos..."
                className="h-10 border-gray-200 bg-white pl-9 shadow-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <a
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  filters.status === 'all'
                    ? 'bg-[#3b82f6] text-white'
                    : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
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
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                    filters.status === s
                      ? 'bg-[#3b82f6] text-white'
                      : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                  )}
                  href={inboxListUrl(tenantSlug, { ...filters, status: s })}
                >
                  {s === 'open' ? 'Abertas' : s === 'waiting' ? 'Aguardando' : 'Fechadas'}
                </a>
              ))}
              <a
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium',
                  filters.unreadOnly ? 'bg-[#3b82f6] text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'
                )}
                href={inboxListUrl(tenantSlug, { ...filters, unreadOnly: !filters.unreadOnly })}
              >
                Não lidas
              </a>
              <a
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium',
                  filters.assignedToMe ? 'bg-[#3b82f6] text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'
                )}
                href={inboxListUrl(tenantSlug, { ...filters, assignedToMe: !filters.assignedToMe })}
              >
                Minhas
              </a>
              <a
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium',
                  filters.ignoredOnly ? 'bg-[#3b82f6] text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'
                )}
                href={inboxListUrl(tenantSlug, { ...filters, ignoredOnly: !filters.ignoredOnly })}
              >
                {filters.ignoredOnly ? 'Principal' : 'Ignoradas'}
              </a>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {filteredConversations.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-gray-500">
                {conversations.length === 0
                  ? filters.ignoredOnly
                    ? 'Nenhuma conversa ignorada.'
                    : 'Nenhuma conversa ainda.'
                  : 'Nenhum resultado na busca.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredConversations.map((c) => {
                  const label = c.contact_name ?? c.contact_phone ?? 'Contato'
                  const tags = c.contact_id ? contactTagMap[c.contact_id] ?? [] : []
                  const shown = tags.slice(0, 2)
                  const more = tags.length - shown.length
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className={cn(
                        'w-full rounded-xl border bg-white p-3 text-left shadow-sm transition-all ring-0 ring-[#3b82f6]/0 hover:shadow-md',
                        activeId === c.id && 'border-[#3b82f6]/40 ring-2 ring-[#3b82f6]/20'
                      )}
                    >
                      <div className="flex gap-3">
                        <div className="relative shrink-0">
                          <div
                            className={cn(
                              'flex size-11 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-white',
                              avatarPaletteClass(c.id)
                            )}
                          >
                            {contactInitials(c.contact_name, c.contact_phone)}
                          </div>
                          <span
                            className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-[#25d366] text-white shadow-sm ring-2 ring-white"
                            title="WhatsApp"
                          >
                            <MessageCircleIcon className="size-2.5" strokeWidth={2.5} />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="truncate font-semibold text-gray-900">{label}</span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {c.unread_count > 0 && (
                                <span className="rounded-full bg-[#3b82f6] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                  {c.unread_count}
                                </span>
                              )}
                              <span className="text-[11px] text-gray-400">
                                {formatRelativeShort(c.last_message_at)}
                              </span>
                            </div>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {c.contact_phone ?? 'Sem telefone'} ·{' '}
                            {c.status === 'open' ? 'Aberta' : c.status === 'waiting' ? 'Aguardando' : 'Fechada'}
                          </p>
                          {tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {shown.map((t) => (
                                <TagPill key={t.id} tag={t} small />
                              ))}
                              {more > 0 && (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                                  +{more}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Centro — chat */}
        <section className="col-span-12 flex min-h-0 min-h-[420px] flex-col border-b border-gray-200/80 bg-white lg:col-span-5 lg:min-h-0 lg:border-b-0">
          <header className="shrink-0 border-b border-gray-100 bg-white px-4 py-3">
            {activeConversation ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-gray-900">{chatTitle}</h2>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
                      <span>WhatsApp</span>
                      {activeConversation.contact_phone && (
                        <span className="text-gray-400">· {activeConversation.contact_phone}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {activeStatus !== 'closed' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-[#3b82f6] text-[#3b82f6] hover:bg-blue-50"
                        disabled={pending}
                        onClick={() => setStatus('closed')}
                      >
                        Finalizar
                      </Button>
                    )}
                    {!filters.ignoredOnly ? (
                      <Button type="button" variant="ghost" size="sm" className="text-gray-500" disabled={pending} onClick={() => setIgnored(true)}>
                        Ignorar
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setIgnored(false)}>
                        Restaurar
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Select value={assigneeValue} onValueChange={(v) => setAssignee(v === 'none' ? null : v)} disabled={pending}>
                    <SelectTrigger className="h-9 w-[200px] border-gray-200 bg-[#f8f9fb] text-xs">
                      <SelectValue placeholder="Atribuir..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não atribuída</SelectItem>
                      {members.map((m) => {
                        const lbl = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email
                        return (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {lbl}
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
                    <SelectTrigger className="h-9 w-[150px] border-gray-200 bg-[#f8f9fb] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Aberta</SelectItem>
                      <SelectItem value="waiting">Aguardando</SelectItem>
                      <SelectItem value="closed">Fechada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-gray-500">Selecione uma conversa</p>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#eef1f6] px-4 py-4">
            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
            {!activeConversation ? (
              <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-gray-500">
                Escolha um contato à esquerda.
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-500">Sem mensagens ainda.</p>
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-4">
                {messageGroups.map((group) => (
                  <div key={group.label}>
                    <div className="mb-3 flex justify-center">
                      <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-sm ring-1 ring-gray-200/80">
                        {group.label}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {group.items.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm',
                            m.direction === 'outbound'
                              ? 'ml-auto bg-[#3b82f6] text-white'
                              : 'mr-auto border border-gray-200/80 bg-white text-gray-900'
                          )}
                        >
                          <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
                          <div
                            className={cn(
                              'mt-1.5 flex items-center gap-2 text-[10px]',
                              m.direction === 'outbound' ? 'text-white/75' : 'text-gray-400'
                            )}
                          >
                            <span>{formatDateTimeBR(m.created_at)}</span>
                            {m.direction === 'outbound' && <span>· {formatOutboundStatus(m)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-100 bg-white p-3">
            <div className="mx-auto flex max-w-2xl items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={activeConversation ? 'Digite uma mensagem...' : 'Selecione uma conversa'}
                disabled={!activeConversation}
                className="min-h-[44px] resize-none rounded-xl border-gray-200 bg-[#f8f9fb] focus-visible:ring-[#3b82f6]"
                rows={2}
              />
              <Button
                className="h-11 shrink-0 rounded-xl bg-[#3b82f6] px-5 hover:bg-[#2563eb]"
                onClick={handleSend}
                disabled={!activeConversation || pending || !draft.trim()}
              >
                Enviar
              </Button>
            </div>
          </div>
        </section>

        {/* Direita — perfil estilo CRM */}
        <aside className="col-span-12 flex min-h-0 flex-col bg-white lg:col-span-3 lg:border-l lg:border-gray-200/80">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!activeConversation ? (
              <p className="text-center text-sm text-gray-500">Detalhes do contato aparecem aqui.</p>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900">
                  {contextLoading ? '…' : (context?.contact?.name ?? activeConversation.contact_name ?? chatTitle)}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {(context?.contactTags ?? []).map((t) => (
                    <TagPill key={t.id} tag={t} />
                  ))}
                  {context?.contact?.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full px-2 text-xs text-[#3b82f6]"
                      onClick={() => setEditTagsOpen(true)}
                    >
                      <PlusIcon className="mr-0.5 size-3" />
                      Tags
                    </Button>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-1 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 py-2 text-left text-sm font-medium text-[#3b82f6] hover:underline"
                    onClick={openNewDeal}
                    disabled={!context?.contact?.id || pending}
                  >
                    <PlusIcon className="size-4" />
                    Adicionar negócio
                  </button>
                </div>

                <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpenProfile((v) => !v)}
                    className="flex w-full items-center justify-between py-2.5 text-left text-sm font-semibold text-gray-800"
                  >
                    Perfil
                    <ChevronDownIcon className={cn('size-4 text-gray-400 transition-transform', openProfile && 'rotate-180')} />
                  </button>
                  {openProfile && (
                    <div className="space-y-3 pb-3 pl-0.5 text-sm">
                      <div className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-2">
                        <span className="text-gray-500">Nome</span>
                        <span className="font-medium text-gray-900">
                          {context?.contact?.name ?? activeConversation.contact_name ?? '—'}
                        </span>
                        <span className="text-gray-500">E-mail</span>
                        <span className="text-gray-900">{context?.contact?.email ?? '—'}</span>
                        <span className="text-gray-500">Telefone</span>
                        <span className="text-gray-900">
                          {context?.contact?.phone ?? activeConversation.contact_phone ?? '—'}
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setOpenNotes((v) => !v)}
                    className="flex w-full items-center justify-between border-t border-gray-100 py-2.5 text-left text-sm font-semibold text-gray-800"
                  >
                    Notas
                    <ChevronDownIcon className={cn('size-4 text-gray-400 transition-transform', openNotes && 'rotate-180')} />
                  </button>
                  {openNotes && (
                    <div className="pb-3 text-sm text-gray-600">
                      {context?.contact?.notes?.trim() ? (
                        <p className="whitespace-pre-wrap rounded-lg bg-[#f8f9fb] p-3 text-sm">{context.contact.notes}</p>
                      ) : (
                        <p className="text-gray-400">Nenhuma nota cadastrada.</p>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setOpenDeals((v) => !v)}
                    className="flex w-full items-center justify-between border-t border-gray-100 py-2.5 text-left text-sm font-semibold text-gray-800"
                  >
                    Negócio
                    <ChevronDownIcon className={cn('size-4 text-gray-400 transition-transform', openDeals && 'rotate-180')} />
                  </button>
                  {openDeals && (
                    <div className="space-y-2 pb-4">
                      {contextLoading ? (
                        <p className="text-xs text-gray-400">Carregando…</p>
                      ) : (context?.deals?.length ?? 0) === 0 ? (
                        <p className="text-xs text-gray-400">Nenhum deal vinculado.</p>
                      ) : (
                        context!.deals.slice(0, 10).map((d) => (
                          <div key={d.id} className="rounded-xl border border-gray-100 bg-[#f8f9fb] px-3 py-2.5">
                            <div className="font-medium text-gray-900 line-clamp-2">{d.title}</div>
                            <div className="mt-1 flex justify-between text-[11px] text-gray-500">
                              <span className="capitalize">{d.status}</span>
                              <span>R$ {Number(d.deal_value ?? 0).toLocaleString('pt-BR')}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {context?.contact && (
        <EditContactDialog
          open={editTagsOpen}
          onOpenChange={async (open) => {
            setEditTagsOpen(open)
            if (!open && activeId) {
              try {
                const ctx = await getConversationContext(tenantSlug, activeId)
                setContext(ctx)
                router.refresh()
              } catch {
                /* ignore */
              }
            }
          }}
          tenantSlug={tenantSlug}
          contact={{
            id: context.contact.id,
            name: context.contact.name,
            tags: context.contactTags,
          }}
        />
      )}

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


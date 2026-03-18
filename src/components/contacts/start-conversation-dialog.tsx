'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { sendConversationMessage, startConversationWithFirstMessage } from '@/app/actions/inbox'
import { applyContactMessageTemplates } from '@/lib/contact-message-templates'
import { listWhatsAppInstances, type WhatsAppInstance } from '@/app/actions/whatsapp'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type ContactPick = { id: string; name: string; phone: string | null; email?: string | null }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  contact: ContactPick | null
}

export function StartConversationDialog({ open, onOpenChange, tenantSlug, contact }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [instances, setInstances] = useState<WhatsAppInstance[]>([])
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [instancesLoading, setInstancesLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [successHint, setSuccessHint] = useState<string | null>(null)

  const reset = useCallback(() => {
    setMessage('')
    setError(null)
    setInstanceId(null)
    setInstances([])
    setInstancesLoading(false)
    setConversationId(null)
    setSuccessHint(null)
  }, [])

  useEffect(() => {
    if (!open || !contact?.phone?.trim()) return
    let cancelled = false
    setInstancesLoading(true)
    setInstances([])
    setInstanceId(null)
    ;(async () => {
      try {
        const list = await listWhatsAppInstances(tenantSlug)
        const active = list.filter((i) => i.is_active)
        if (!cancelled) {
          setInstances(active)
          setInstanceId(active[0]?.id ?? null)
        }
      } catch {
        if (!cancelled) {
          setInstances([])
          setInstanceId(null)
        }
      } finally {
        if (!cancelled) setInstancesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, tenantSlug, contact?.id, contact?.phone])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  useEffect(() => {
    if (!open || !contact?.id) return
    setConversationId(null)
    setSuccessHint(null)
    setMessage('')
    setError(null)
  }, [open, contact?.id])

  const resolvedPreview = useMemo(() => {
    if (!contact?.name || !message.trim()) return ''
    return applyContactMessageTemplates(message, {
      name: contact.name,
      email: contact.email ?? null,
    })
  }, [message, contact?.name, contact?.email])

  function handleSubmit() {
    if (!contact?.id) return
    const body = applyContactMessageTemplates(message, {
      name: contact.name,
      email: contact.email ?? null,
    }).trim()
    if (!body) {
      setError('Digite a mensagem (após substituir os templates, o texto não pode ficar vazio).')
      return
    }
    const inst = instanceId ?? instances[0]?.id
    if (!inst && !conversationId) {
      setError('Nenhuma instância do WhatsApp disponível. Configure em Configurações.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        if (conversationId) {
          await sendConversationMessage({
            tenantSlug,
            conversationId,
            body,
          })
          setSuccessHint('Mensagem enviada. Envie outra ou feche para escolher outro contato.')
        } else {
          const { conversationId: cid } = await startConversationWithFirstMessage({
            tenantSlug,
            contactId: contact.id,
            body,
            whatsappInstanceId: inst!,
          })
          setConversationId(cid)
          setSuccessHint('Mensagem enviada. Permaneça nesta tela para enviar outra a este contato ou feche para outro.')
        }
        setMessage('')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar.')
      }
    })
  }

  const hasPhone = Boolean(contact?.phone?.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Iniciar conversa</DialogTitle>
          <DialogDescription>
            {contact ? (
              <>
                Enviar primeira mensagem para <span className="font-medium text-foreground">{contact.name}</span>
                {hasPhone ? (
                  <span className="block mt-1 text-muted-foreground">{contact.phone}</span>
                ) : (
                  <span className="block mt-1 text-amber-700">Este contato não tem telefone cadastrado.</span>
                )}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {!hasPhone ? null : (
          <div className="grid gap-3">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            {successHint && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {successHint}
                {conversationId && (
                  <a
                    className="block mt-2 text-xs text-blue-700 hover:underline"
                    href={`/${tenantSlug}/inbox?conversation=${conversationId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir thread no inbox
                  </a>
                )}
              </div>
            )}

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Instância WhatsApp</label>
              {instancesLoading ? (
                <p className="text-sm text-muted-foreground py-2">Carregando instâncias...</p>
              ) : instances.length === 0 ? (
                <p className="text-sm text-amber-700 py-2">
                  Nenhuma instância ativa. Cadastre em Configurações.
                </p>
              ) : (
                <Select
                  value={instanceId ?? instances[0]!.id}
                  onValueChange={setInstanceId}
                  disabled={Boolean(conversationId)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {conversationId && (
                <p className="text-xs text-muted-foreground">Instância fixada nesta conversa.</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Mensagem</label>
              <p className="text-xs text-muted-foreground">
                Use <code className="rounded bg-muted px-1">{'{nome}'}</code> ou{' '}
                <code className="rounded bg-muted px-1">{'{primeiro_nome}'}</code> com os dados do cadastro.
              </p>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={'Olá {primeiro_nome}, tudo bem? ...'}
                className="min-h-[120px]"
                disabled={pending}
              />
              {resolvedPreview && (
                <div className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Pré-visualização (enviado)</div>
                  <div className="whitespace-pre-wrap text-foreground">{resolvedPreview}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {hasPhone && (
            <Button
              type="button"
              disabled={
                pending ||
                !message.trim() ||
                instancesLoading ||
                (!conversationId && instances.length === 0)
              }
              onClick={handleSubmit}
            >
              {pending ? 'Enviando...' : 'Enviar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

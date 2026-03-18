'use client'

import { useMemo, useState, useTransition } from 'react'
import type { WhatsAppInstance } from '@/app/actions/whatsapp'
import { createWhatsAppInstance, updateWhatsAppInstance } from '@/app/actions/whatsapp'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

function webhookUrl() {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/api/webhooks/uazapi`
}

function maskToken(s: string) {
  if (!s) return ''
  if (s.length <= 8) return '********'
  return `${s.slice(0, 3)}***${s.slice(-3)}`
}

export function WhatsAppSettings({
  tenantSlug,
  instances,
}: {
  tenantSlug: string
  instances: WhatsAppInstance[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [instanceToken, setInstanceToken] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [apiToken, setApiToken] = useState('')

  const hasInstances = instances.length > 0

  const instructions = useMemo(() => {
    return [
      `Webhook URL: ${webhookUrl()}?token=<INSTANCE_TOKEN>`,
      `Ou header: x-instance-token: <INSTANCE_TOKEN>`,
      `A instância é identificada/autenticada apenas pelo token.`,
    ].join('\n')
  }, [])

  function resetForm() {
    setName('')
    setInstanceToken('')
    setPhoneNumber('')
    setApiBaseUrl('')
    setApiToken('')
    setError(null)
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) return setError('Informe um nome.')
    if (!instanceToken.trim()) return setError('Informe o instance token.')

    startTransition(async () => {
      try {
        await createWhatsAppInstance({
          tenantSlug,
          name: name.trim(),
          instanceToken: instanceToken.trim(),
          phoneNumber: phoneNumber.trim() ? phoneNumber.trim() : null,
          apiBaseUrl: apiBaseUrl.trim() ? apiBaseUrl.trim() : null,
          apiToken: apiToken.trim() ? apiToken.trim() : null,
        })
        setOpen(false)
        resetForm()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao criar instância.')
      }
    })
  }

  function toggleActive(instance: WhatsAppInstance) {
    startTransition(async () => {
      try {
        await updateWhatsAppInstance({
          tenantSlug,
          instanceId: instance.id,
          fields: { is_active: !instance.is_active },
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao atualizar instância.')
      }
    })
  }

  return (
    <div className="bg-white shadow rounded-lg p-6 border">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">WhatsApp (Uazapi)</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre instâncias e configure o webhook para receber mensagens no Inbox.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Nova instância</Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 rounded-lg border p-3">
        <div className="text-xs text-muted-foreground mb-2">Instruções rápidas</div>
        <Textarea readOnly value={instructions} className="min-h-24 text-xs font-mono" />
      </div>

      <div className="mt-6">
        {!hasInstances ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhuma instância cadastrada ainda. Crie uma para habilitar o webhook.
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
              <div className="col-span-4">Nome</div>
            <div className="col-span-6">Instance token</div>
              <div className="col-span-2 text-right">Status</div>
            </div>
            <div className="divide-y">
              {instances.map((i) => (
                <div key={i.id} className="grid grid-cols-12 px-3 py-3 text-sm items-center">
                  <div className="col-span-4">
                    <div className="font-medium text-gray-900">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{i.phone_number ?? ''}</div>
                  </div>
                <div className="col-span-6 font-mono text-xs text-muted-foreground truncate">
                  {maskToken(i.instance_token)}
                </div>
                  <div className="col-span-2 flex justify-end">
                    <Button
                      size="sm"
                      variant={i.is_active ? 'default' : 'outline'}
                      disabled={pending}
                      onClick={() => toggleActive(i)}
                    >
                      {i.is_active ? 'Ativa' : 'Inativa'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) resetForm()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova instância WhatsApp</DialogTitle>
            <DialogDescription>
              Configure a instância (Uazapi) e o segredo do webhook.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="grid gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Nome</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Comercial" />
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Instance token</label>
              <Input
                value={instanceToken}
                onChange={(e) => setInstanceToken(e.target.value)}
                placeholder="Cole o token da instância"
              />
              <div className="text-xs text-muted-foreground">
                Usado para autenticar o webhook (header <span className="font-mono">x-instance-token</span> ou query
                <span className="font-mono">?token=</span>).
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Telefone (opcional)</label>
                <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+55..." />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">API Base URL (opcional)</label>
                <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">API Token (opcional)</label>
              <Input value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="Bearer token" />
              <div className="text-xs text-muted-foreground">
                Usado para envio de mensagens no MVP (se preenchido).
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Criando...' : 'Criar instância'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}


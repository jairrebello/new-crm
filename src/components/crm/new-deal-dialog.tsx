'use client'

import { useState, useTransition } from 'react'
import type { Pipeline, Deal } from '@/app/actions/deals'
import { createDeal } from '@/app/actions/deals'
import type { ContactOption } from '@/app/actions/contacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline: Pipeline
  tenantSlug: string
  onCreated: (deal: Deal) => void
  contacts: ContactOption[]
}

export function NewDealDialog({ open, onOpenChange, pipeline, tenantSlug, onCreated, contacts }: Props) {
  const defaultStageId = pipeline.stages[0]?.id ?? ''
  const [title, setTitle] = useState('')
  const [dealValue, setDealValue] = useState<string>('')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [stageId, setStageId] = useState(defaultStageId)
  const [contactId, setContactId] = useState<string>('none')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const selectedStageName = pipeline.stages.find((s) => s.id === stageId)?.name
  const selectedPriorityLabel =
    priority === 'high' ? 'Alta' : priority === 'medium' ? 'Média' : 'Baixa'
  const selectedContact = contacts.find((c) => c.id === contactId)
  const selectedContactLabel = selectedContact
    ? `${selectedContact.name}${selectedContact.phone ? ` · ${selectedContact.phone}` : ''}`
    : 'Sem contato'

  function reset() {
    setTitle('')
    setDealValue('')
    setPriority('medium')
    setStageId(defaultStageId)
    setContactId('none')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Informe um título.')
      return
    }
    if (!stageId) {
      setError('Selecione uma etapa.')
      return
    }

    const valueNumber = dealValue.trim() ? Number(dealValue) : 0
    if (Number.isNaN(valueNumber) || valueNumber < 0) {
      setError('Valor inválido.')
      return
    }

    startTransition(async () => {
      try {
        const created = await createDeal({
          tenantSlug,
          title: title.trim(),
          pipelineId: pipeline.id,
          stageId,
          contactId: contactId === 'none' ? null : contactId,
          dealValue: valueNumber,
          priority,
        })
        onCreated(created)
        reset()
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao criar deal.')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo deal</DialogTitle>
          <DialogDescription>
            Crie um deal rapidamente na pipeline <span className="font-medium">{pipeline.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Título</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Venda ERP" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Etapa</label>
              <Select value={stageId} onValueChange={(v) => setStageId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione...">{selectedStageName}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {pipeline.stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium">Prioridade</label>
              <Select
                value={priority}
                onValueChange={(v) => {
                  if (v === 'high' || v === 'medium' || v === 'low') setPriority(v)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{selectedPriorityLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium">Contato (opcional)</label>
            <Select value={contactId} onValueChange={(v) => setContactId(v ?? 'none')}>
              <SelectTrigger className="w-full">
                <SelectValue>{selectedContactLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem contato</SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium">Valor (R$)</label>
            <Input
              inputMode="decimal"
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              placeholder="0"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Criando...' : 'Criar deal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}


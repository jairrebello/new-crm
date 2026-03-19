'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Tag } from '@/app/actions/contacts'
import { updateContactTags } from '@/app/actions/contacts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  contact: {
    id: string
    name: string
    tags?: Tag[]
  }
}

export function EditContactDialog({ open, onOpenChange, tenantSlug, contact }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tagsText, setTagsText] = useState('')

  const initialTagsText = useMemo(() => {
    return (contact.tags ?? [])
      .map((t) => t.name)
      .filter(Boolean)
      .join(', ')
  }, [contact.tags])

  const reset = useCallback(() => {
    setError(null)
    setTagsText(initialTagsText)
  }, [initialTagsText])

  useEffect(() => {
    if (!open) return
    // Evita setState "sincrono" dentro do useEffect (regra do eslint/React).
    queueMicrotask(() => reset())
  }, [open, reset])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    startTransition(async () => {
      try {
        await updateContactTags({
          tenantSlug,
          contactId: contact.id,
          tags,
        })
        onOpenChange(false)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao atualizar tags do contato.'
        setError(msg)
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
          <DialogTitle>Editar contato</DialogTitle>
          <DialogDescription>
            Atualize as tags do contato <span className="font-medium">{contact.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Tags (separadas por vírgula)</label>
            <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Ex: VIP, Newsletter" />
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
              {pending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}


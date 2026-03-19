'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import type { Account, Contact } from '@/app/actions/contacts'
import { createContact } from '@/app/actions/contacts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  accounts: Account[]
  onCreated?: (contact: Contact) => void
}

export function NewContactDialog({ open, onOpenChange, tenantSlug, accounts, onCreated }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [accountId, setAccountId] = useState<string>('none')

  const accountOptions = useMemo(() => accounts ?? [], [accounts])

  const reset = useCallback(() => {
    setName('')
    setEmail('')
    setPhone('')
    setNotes('')
    setTagsText('')
    setAccountId('none')
    setError(null)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Informe o nome.')
      return
    }

    startTransition(async () => {
      try {
        const tags = tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)

        const created = await createContact({
          tenantSlug,
          name: name.trim(),
          email: email.trim() ? email.trim() : null,
          phone: phone.trim() ? phone.trim() : null,
          notes: notes.trim() ? notes.trim() : null,
          accountId: accountId === 'none' ? null : accountId,
          tags: tags.length > 0 ? tags : undefined,
        })
        onCreated?.(created)
        onOpenChange(false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao criar contato.'
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
          <DialogDescription>Cadastre um lead/cliente dentro deste tenant.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Maria Souza" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">E-mail</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@empresa.com" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Telefone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 99999-9999" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Empresa (opcional)</label>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? 'none')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem empresa</SelectItem>
                {accountOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Observações</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexto, preferências, etc." />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Tags (separadas por vírgula)</label>
            <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Ex: VIP, Newsletter" />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Criando...' : 'Criar contato'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}


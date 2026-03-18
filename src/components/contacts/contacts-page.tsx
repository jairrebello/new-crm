'use client'

import { useState } from 'react'
import type { Account, Contact } from '@/app/actions/contacts'
import { NewContactDialog } from '@/components/contacts/new-contact-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ContactsPageClient({
  tenantSlug,
  accounts,
  contacts,
  q,
}: {
  tenantSlug: string
  accounts: Account[]
  contacts: Contact[]
  q: string
}) {
  const [newOpen, setNewOpen] = useState(false)

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Contatos</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie seus leads e clientes em <span className="font-medium">{tenantSlug}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setNewOpen(true)}>Novo contato</Button>
        </div>
      </div>

      <div className="mt-6 rounded-lg border bg-white p-4 shadow-sm">
        <form className="flex items-center gap-2" action="">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, e-mail ou telefone..."
            className="max-w-md"
          />
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>

        <div className="mt-4 overflow-hidden rounded-lg border">
          <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
            <div className="col-span-4">Nome</div>
            <div className="col-span-3">Empresa</div>
            <div className="col-span-3">Contato</div>
            <div className="col-span-2 text-right">Criado em</div>
          </div>

          {contacts.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhum contato encontrado.</div>
          ) : (
            <div className="divide-y">
              {contacts.map((c) => (
                <div key={c.id} className="grid grid-cols-12 px-3 py-3 text-sm">
                  <div className="col-span-4">
                    <div className="font-medium text-gray-900">{c.name}</div>
                    {c.notes && <div className="text-xs text-muted-foreground line-clamp-1">{c.notes}</div>}
                  </div>
                  <div className="col-span-3 text-muted-foreground">{c.account?.name ?? '—'}</div>
                  <div className="col-span-3 text-muted-foreground">
                    <div className="truncate">{c.email ?? '—'}</div>
                    <div className="truncate">{c.phone ?? ''}</div>
                  </div>
                  <div className="col-span-2 text-right text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <NewContactDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        tenantSlug={tenantSlug}
        accounts={accounts}
      />
    </div>
  )
}


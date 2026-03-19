'use client'

import { useState } from 'react'
import type { Account, Contact, Tag } from '@/app/actions/contacts'
import { NewContactDialog } from '@/components/contacts/new-contact-dialog'
import { ImportContactsCsvDialog } from '@/components/contacts/import-contacts-csv-dialog'
import { StartConversationDialog } from '@/components/contacts/start-conversation-dialog'
import { EditContactDialog } from '@/components/contacts/edit-contact-dialog'
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
  const [importOpen, setImportOpen] = useState(false)
  const [conversationContact, setConversationContact] = useState<{
    id: string
    name: string
    phone: string | null
    email: string | null
  } | null>(null)

  const [editContact, setEditContact] = useState<{
    id: string
    name: string
    tags?: Tag[]
  } | null>(null)

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
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            Importar CSV
          </Button>
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
            <div className="col-span-3">Nome</div>
            <div className="col-span-2">Empresa</div>
            <div className="col-span-3">Contato</div>
            <div className="col-span-2 text-center">Ações</div>
            <div className="col-span-2 text-right">Criado em</div>
          </div>

          {contacts.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhum contato encontrado.</div>
          ) : (
            <div className="divide-y">
              {contacts.map((c) => (
                <div key={c.id} className="grid grid-cols-12 items-center px-3 py-3 text-sm">
                  <div className="col-span-3">
                    <div className="font-medium text-gray-900">{c.name}</div>
                    {c.notes && <div className="text-xs text-muted-foreground line-clamp-1">{c.notes}</div>}
                    {c.tags && c.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.tags.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-gray-800"
                            style={{ backgroundColor: t.color ?? '#e2e8f0' }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-muted-foreground">{c.account?.name ?? '—'}</div>
                  <div className="col-span-3 text-muted-foreground">
                    <div className="truncate">{c.email ?? '—'}</div>
                    <div className="truncate">{c.phone ?? ''}</div>
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs w-full"
                        disabled={!c.phone?.trim()}
                        title={!c.phone?.trim() ? 'Cadastre um telefone para iniciar conversa' : undefined}
                        onClick={() =>
                          setConversationContact({
                            id: c.id,
                            name: c.name,
                            phone: c.phone ?? null,
                            email: c.email ?? null,
                          })
                        }
                      >
                        Iniciar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs w-full"
                        onClick={() => setEditContact({ id: c.id, name: c.name, tags: c.tags })}
                      >
                        Editar
                      </Button>
                    </div>
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

      <ImportContactsCsvDialog open={importOpen} onOpenChange={setImportOpen} tenantSlug={tenantSlug} />

      <StartConversationDialog
        open={Boolean(conversationContact)}
        onOpenChange={(open) => {
          if (!open) setConversationContact(null)
        }}
        tenantSlug={tenantSlug}
        contact={conversationContact}
      />

      {editContact && (
        <EditContactDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditContact(null)
          }}
          tenantSlug={tenantSlug}
          contact={editContact}
        />
      )}
    </div>
  )
}


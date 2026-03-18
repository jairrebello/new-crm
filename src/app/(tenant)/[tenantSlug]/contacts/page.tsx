import { listAccounts, listContacts } from '@/app/actions/contacts'
import { ContactsPageClient } from '@/components/contacts/contacts-page'

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>
  searchParams?: Promise<{ q?: string }>
}) {
  const { tenantSlug } = await params
  const resolvedSearchParams = (await searchParams) ?? {}
  const q = resolvedSearchParams.q?.trim() ?? ''

  const [accounts, contacts] = await Promise.all([listAccounts(tenantSlug), listContacts(tenantSlug, { q })])

  return (
    <ContactsPageClient tenantSlug={tenantSlug} accounts={accounts} contacts={contacts} q={q} />
  )
}

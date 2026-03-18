import { getDealsForKanban } from '@/app/actions/deals'
import { listContactOptions } from '@/app/actions/contacts'
import { KanbanBoard } from '@/components/crm/kanban-board'

export default async function KanbanPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params

  const [pipelines, contacts] = await Promise.all([getDealsForKanban(tenantSlug), listContactOptions(tenantSlug)])

  return (
    <div className="h-[calc(100vh-140px)]">
      <KanbanBoard pipelines={pipelines} tenantSlug={tenantSlug} contacts={contacts} />
    </div>
  )
}

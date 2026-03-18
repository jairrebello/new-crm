import { listPipelines } from '@/app/actions/pipelines'
import { PipelinesSettings } from '@/components/settings/pipelines-settings'

export default async function SettingsPipelinesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params
  const pipelines = await listPipelines(tenantSlug)

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Configurações da empresa</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1 border-r pr-4">
          <nav className="space-y-1">
            <a href="#" className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-md font-medium">
              Geral
            </a>
            <a href="#" className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-md font-medium">
              Membros
            </a>
            <a
              href={`/${tenantSlug}/settings/pipelines`}
              className="block px-3 py-2 bg-blue-50 text-blue-700 rounded-md font-medium"
            >
              Pipelines
            </a>
            <a href="#" className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-md font-medium">
              WhatsApp
            </a>
            <a href="#" className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-md font-medium">
              Faturamento
            </a>
          </nav>
        </div>

        <div className="md:col-span-3">
          <PipelinesSettings tenantSlug={tenantSlug} pipelines={pipelines} />
        </div>
      </div>
    </div>
  )
}


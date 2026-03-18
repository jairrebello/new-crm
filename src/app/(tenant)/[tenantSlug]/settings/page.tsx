import { listWhatsAppInstances } from '@/app/actions/whatsapp'
import { WhatsAppSettings } from '@/components/settings/whatsapp-settings'

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params

  const instances = await listWhatsAppInstances(tenantSlug)

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Configurações da empresa</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1 border-r pr-4">
          <nav className="space-y-1">
            <a href="#" className="block px-3 py-2 bg-blue-50 text-blue-700 rounded-md font-medium">Geral</a>
            <a href="#" className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-md font-medium">Membros</a>
            <a href="#" className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-md font-medium">Pipelines</a>
            <a href="#" className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-md font-medium">WhatsApp</a>
            <a href="#" className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-md font-medium">Faturamento</a>
          </nav>
        </div>
        
        <div className="md:col-span-3">
          <div className="bg-white shadow rounded-lg p-6 border">
            <h3 className="text-lg font-medium mb-4">Perfil</h3>
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nome da empresa</label>
                <input type="text" defaultValue={tenantSlug} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Slug</label>
                <input type="text" defaultValue={tenantSlug} disabled className="mt-1 block w-full border border-gray-200 bg-gray-50 rounded-md shadow-sm py-2 px-3 sm:text-sm text-gray-500" />
              </div>
              <div className="pt-4 border-t">
                <button type="button" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium">
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>

          <div className="mt-6">
            <WhatsAppSettings tenantSlug={tenantSlug} instances={instances} />
          </div>
        </div>
      </div>
    </div>
  )
}

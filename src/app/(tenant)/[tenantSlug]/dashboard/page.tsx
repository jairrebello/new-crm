export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params
  const demoBRL = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(45000)
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Visão geral</h2>
      <p className="text-sm text-gray-500 mb-6">
        Ambiente: <span className="font-medium">{tenantSlug}</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-gray-500 text-sm font-medium">Total de leads</h3>
          <p className="text-3xl font-bold mt-2 text-gray-900">142</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-gray-500 text-sm font-medium">Negócios abertos</h3>
          <p className="text-3xl font-bold mt-2 text-gray-900">{demoBRL}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-gray-500 text-sm font-medium">Taxa de conversão</h3>
          <p className="text-3xl font-bold mt-2 text-gray-900">24%</p>
        </div>
      </div>
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createDemoTenant } from '@/app/actions/seed'
import { Button } from '@/components/ui/button'

type TenantRef = { slug: string; name: string }
type TenantUserRow = { tenant_id: string; tenants: TenantRef | TenantRef[] | null }

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: userData, error } = await supabase.auth.getUser()
  if (error || !userData?.user) {
    redirect('/login')
  }

  // Check if user belongs to any tenant
  const { data: tenantUsers } = await supabase
    .from('tenant_users')
    .select('tenant_id, tenants(slug, name)')
    .eq('user_id', userData.user.id)

  if (tenantUsers && tenantUsers.length > 0) {
    // If user has a tenant, redirect them to their first tenant's dashboard
    const rawTenant = (tenantUsers as unknown as TenantUserRow[])[0]?.tenants
    const firstTenant = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant
    if (firstTenant?.slug) redirect(`/${firstTenant.slug}/dashboard`)
  }

  // If no tenant, show onboarding/seeding screen
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 flex-col gap-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-2">Boas-vindas ao seu CRM!</h1>
        <p className="text-gray-600 mb-8">
          Você entrou com sucesso, mas ainda não faz parte de nenhuma empresa (tenant).
        </p>

        <form action={async () => {
          'use server'
          const res = await createDemoTenant()
          if (res.success && res.tenantSlug) {
            redirect(`/${res.tenantSlug}/dashboard`)
          } else {
            console.error(res.error)
            // Handle error minimally for now
          }
        }}>
          <Button size="lg" className="w-full" type="submit">
            Criar ambiente de demonstração e configurar dados
          </Button>
        </form>
      </div>
    </div>
  )
}

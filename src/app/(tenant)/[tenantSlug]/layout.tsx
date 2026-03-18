import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tenantSlug: string }>
}) {
  const supabase = await createClient()
  const { tenantSlug } = await params

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect('/login')
  }

  const { data: tenantUsers, error: tenantUsersError } = await supabase
    .from('tenant_users')
    .select('tenant_id, tenants(id, name, slug, tenant_settings(logo_url))')
    .eq('user_id', data.user.id)

  if (tenantUsersError) {
    throw tenantUsersError
  }

  const tenants = (tenantUsers ?? [])
    .map((tu) => {
      const t = tu.tenants as unknown as {
        id: string
        name: string
        slug: string
        tenant_settings?: { logo_url: string | null } | null
      } | null

      if (!t) return null
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        logo_url: t.tenant_settings?.logo_url ?? null,
      }
    })
    .filter(Boolean) as Array<{ id: string; name: string; slug: string; logo_url: string | null }>

  if (tenants.length === 0) {
    redirect('/dashboard')
  }

  const hasAccessToSlug = tenants.some((t) => t.slug === tenantSlug)
  if (!hasAccessToSlug) {
    notFound()
  }

  return (
    <SidebarProvider>
      <AppSidebar tenantSlug={tenantSlug} tenants={tenants} />
      <main className="w-full flex-1 p-8 bg-gray-50 h-screen overflow-y-auto">
        <div className="flex items-center gap-2 border-b pb-4 mb-4">
          <SidebarTrigger />
          <h1 className="text-xl font-bold">{tenantSlug} Environment</h1>
        </div>
        {children}
      </main>
    </SidebarProvider>
  )
}

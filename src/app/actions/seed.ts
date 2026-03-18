'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createDemoTenant() {
  const supabase = await createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return { error: 'Você precisa estar logado primeiro.' }
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminClient = createAdminClient()

  // 1. Create Tenant (Bypassing RLS)
  const { data: tenantData, error: tenantError } = await adminClient
    .from('tenants')
    .insert({
      name: 'Empresa Demo',
      slug: 'demo',
    })
    .select()
    .single()

  if (tenantError) return { error: tenantError.message }

  // 2. Fetch the "owner" role ID
  const { data: roleData, error: roleError } = await adminClient
    .from('roles')
    .select('id')
    .eq('name', 'owner')
    .single()

  if (roleError) return { error: roleError.message }

  // 3. Link User to Tenant as Owner
  const { error: linkError } = await adminClient
    .from('tenant_users')
    .insert({
      tenant_id: tenantData.id,
      user_id: userData.user.id,
      role_id: roleData.id,
    })

  if (linkError) return { error: linkError.message }

  // 4. Create default CRM Data (Pipeline & Stages)
  const { data: pipelineData, error: pipelineError } = await adminClient
    .from('pipelines')
    .insert({
      tenant_id: tenantData.id,
      name: 'Vendas (padrão)',
      is_default: true,
    })
    .select()
    .single()

  if (pipelineError) return { error: pipelineError.message }

  const defaultStages = [
    { tenant_id: tenantData.id, pipeline_id: pipelineData.id, name: 'Entrada', sort_order: 1 },
    { tenant_id: tenantData.id, pipeline_id: pipelineData.id, name: 'Contato realizado', sort_order: 2 },
    { tenant_id: tenantData.id, pipeline_id: pipelineData.id, name: 'Proposta enviada', sort_order: 3 },
    { tenant_id: tenantData.id, pipeline_id: pipelineData.id, name: 'Negociação', sort_order: 4 },
  ]

  const { error: stagesError } = await supabase
    .from('pipeline_stages')
    .insert(defaultStages)

  if (stagesError) return { error: stagesError.message }

  revalidatePath('/', 'layout')
  return { success: true, tenantSlug: tenantData.slug }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type Deal = {
  id: string
  title: string
  deal_value: number
  status: string
  priority: string
  source: string | null
  expected_close_date: string | null
  stage_id: string
  pipeline_id: string
  contact_id: string | null
  account_id: string | null
  owner_user_id: string | null
  created_at: string
  contact?: { name: string } | null
  account?: { name: string } | null
  owner?: { first_name: string | null; last_name: string | null } | null
}

export type PipelineStage = {
  id: string
  name: string
  color: string
  sort_order: number
  deals: Deal[]
}

export type Pipeline = {
  id: string
  name: string
  is_default: boolean
  stages: PipelineStage[]
}

function firstOrNull<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null
  return (value as T) ?? null
}

function normalizeDeal(row: unknown): Deal {
  const r = row as Deal & { contact?: unknown; account?: unknown; owner?: unknown }
  return {
    ...r,
    contact: firstOrNull<Deal['contact']>(r.contact),
    account: firstOrNull<Deal['account']>(r.account),
    owner: firstOrNull<Deal['owner']>(r.owner),
  }
}

export async function getDealsForKanban(tenantSlug: string): Promise<Pipeline[]> {
  const supabase = await createClient()

  // Get tenant id from slug
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .single()

  if (!tenant) return []

  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('id, name, is_default')
    .eq('tenant_id', tenant.id)
    .order('created_at')

  if (!pipelines?.length) return []

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name, color, sort_order, pipeline_id')
    .eq('tenant_id', tenant.id)
    .order('sort_order')

  const { data: deals } = await supabase
    .from('deals')
    .select(`
      id, title, deal_value, status, priority, source,
      expected_close_date, stage_id, pipeline_id,
      contact_id, account_id, owner_user_id, created_at,
      contact:contacts(name),
      account:accounts(name),
      owner:users(first_name, last_name)
    `)
    .eq('tenant_id', tenant.id)
    .eq('status', 'open')

  const normalizedDeals = (deals ?? []).map(normalizeDeal)

  return pipelines.map((pipeline) => ({
    ...pipeline,
    stages: (stages ?? [])
      .filter((s) => s.pipeline_id === pipeline.id)
      .map((stage) => ({
        ...stage,
        deals: normalizedDeals.filter((d) => d.stage_id === stage.id),
      })),
  }))
}

export async function moveDeal(dealId: string, newStageId: string, tenantSlug: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('deals')
    .update({ stage_id: newStageId, updated_at: new Date().toISOString() })
    .eq('id', dealId)

  if (error) throw new Error(error.message)
  revalidatePath(`/${tenantSlug}/crm`)
}

export async function createDeal(data: {
  tenantSlug: string
  title: string
  pipelineId: string
  stageId: string
  contactId?: string | null
  accountId?: string | null
  dealValue?: number
  priority?: string
  expectedCloseDate?: string | null
}): Promise<Deal> {
  const supabase = await createClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', data.tenantSlug)
    .single()

  if (!tenant) throw new Error('Tenant não encontrado.')

  const { data: authUser } = await supabase.auth.getUser()

  const { data: created, error } = await supabase
    .from('deals')
    .insert({
    tenant_id: tenant.id,
    pipeline_id: data.pipelineId,
    stage_id: data.stageId,
    title: data.title,
    contact_id: data.contactId ?? null,
    account_id: data.accountId ?? null,
    deal_value: data.dealValue ?? 0,
    priority: data.priority ?? 'medium',
    expected_close_date: data.expectedCloseDate ?? null,
    owner_user_id: authUser.user?.id ?? null,
    status: 'open',
  })
    .select(`
      id, title, deal_value, status, priority, source,
      expected_close_date, stage_id, pipeline_id,
      contact_id, account_id, owner_user_id, created_at,
      contact:contacts(name),
      account:accounts(name),
      owner:users(first_name, last_name)
    `)
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/${data.tenantSlug}/crm`)

  return normalizeDeal(created)
}

export async function getDealDetails(dealId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('deals')
    .select(`
      id, title, deal_value, status, priority, source,
      expected_close_date, stage_id, pipeline_id,
      contact_id, account_id, owner_user_id, created_at, updated_at,
      contact:contacts(id, name, email, phone),
      account:accounts(id, name),
      owner:users(id, first_name, last_name, avatar_url),
      stage:pipeline_stages(id, name, color)
    `)
    .eq('id', dealId)
    .single()

  if (error) throw new Error(error.message)
  const row = data as unknown as {
    contact?: unknown
    account?: unknown
    owner?: unknown
    stage?: unknown
  }

  return {
    ...(data as object),
    contact: firstOrNull<{ id: string; name: string; email: string | null; phone: string | null }>(row.contact),
    account: firstOrNull<{ id: string; name: string }>(row.account),
    owner: firstOrNull<{ id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }>(
      row.owner
    ),
    stage: firstOrNull<{ id: string; name: string; color: string }>(row.stage),
  }
}

export async function updateDeal(dealId: string, fields: Partial<{
  title: string
  deal_value: number
  priority: string
  status: string
  expected_close_date: string | null
  stage_id: string
}>, tenantSlug: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('deals')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', dealId)

  if (error) throw new Error(error.message)
  revalidatePath(`/${tenantSlug}/crm`)
}

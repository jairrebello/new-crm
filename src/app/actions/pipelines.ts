'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type PipelineStage = {
  id: string
  name: string
  color: string
  sort_order: number
}

export type Pipeline = {
  id: string
  name: string
  is_default: boolean
  stages: PipelineStage[]
}

export type PipelineStageDraft = {
  id?: string
  name: string
  color: string
}

function btrim(s: string) {
  return s.replace(/^\s+|\s+$/g, '')
}

function normalizeHexColor(input: string) {
  const c = btrim(input).toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(c)) return c
  return '#e2e8f0'
}

async function getTenantIdBySlugOrThrow(tenantSlug: string) {
  const supabase = await createClient()
  const { data: tenant, error } = await supabase.from('tenants').select('id').eq('slug', tenantSlug).single()
  if (error) throw new Error(error.message)
  if (!tenant) throw new Error('Tenant não encontrado')
  return tenant.id as string
}

export async function listPipelines(tenantSlug: string): Promise<Pipeline[]> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(tenantSlug)

  const { data: pipelines, error: pipelinesError } = await supabase
    .from('pipelines')
    .select('id, name, is_default')
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (pipelinesError) throw new Error(pipelinesError.message)
  if (!pipelines?.length) return []

  const { data: stages, error: stagesError } = await supabase
    .from('pipeline_stages')
    .select('id, name, color, sort_order, pipeline_id')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })

  if (stagesError) throw new Error(stagesError.message)

  return (pipelines ?? []).map((pipeline) => ({
    ...(pipeline as { id: string; name: string; is_default: boolean }),
    stages: (stages ?? [])
      .filter((s) => s.pipeline_id === pipeline.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color ?? '#e2e8f0',
        sort_order: s.sort_order,
      })),
  }))
}

export async function createPipeline(input: {
  tenantSlug: string
  name: string
  is_default?: boolean
  stages: Array<{ name: string; color: string }>
}): Promise<Pipeline> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(input.tenantSlug)

  const stages = input.stages ?? []
  const pipelineName = btrim(input.name)
  if (!pipelineName) throw new Error('Informe o nome da pipeline.')
  if (stages.length === 0) throw new Error('Informe pelo menos 1 etapa.')

  const { data: created, error } = await supabase
    .from('pipelines')
    .insert({
      tenant_id: tenantId,
      name: pipelineName,
      is_default: Boolean(input.is_default),
    })
    .select('id, name, is_default')
    .single()

  if (error) throw new Error(error.message)

  if (input.is_default) {
    const { error: resetError } = await supabase
      .from('pipelines')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .neq('id', created.id)
    if (resetError) throw new Error(resetError.message)
  }

  const stagePayload = stages.map((s, idx) => ({
    tenant_id: tenantId,
    pipeline_id: created.id,
    name: btrim(s.name),
    color: normalizeHexColor(s.color),
    sort_order: idx + 1,
  }))

  const { error: stagesError } = await supabase.from('pipeline_stages').insert(stagePayload)
  if (stagesError) throw new Error(stagesError.message)

  const pipelines = await listPipelines(input.tenantSlug)
  const pipeline = pipelines.find((p) => p.id === created.id)
  if (!pipeline) throw new Error('Falha ao carregar a pipeline criada.')
  revalidatePath(`/${input.tenantSlug}/settings/pipelines`)
  revalidatePath(`/${input.tenantSlug}/crm`)
  revalidatePath(`/${input.tenantSlug}/inbox`)
  return pipeline
}

export async function syncPipeline(input: {
  tenantSlug: string
  pipelineId: string
  name: string
  is_default: boolean
  stages: PipelineStageDraft[]
  deletedStageIds: string[]
}): Promise<Pipeline> {
  const supabase = await createClient()
  const tenantId = await getTenantIdBySlugOrThrow(input.tenantSlug)

  const pipelineName = btrim(input.name)
  if (!pipelineName) throw new Error('Informe o nome da pipeline.')
  if (!input.stages || input.stages.length === 0) throw new Error('Informe pelo menos 1 etapa.')

  if (input.is_default) {
    const { error: resetError } = await supabase
      .from('pipelines')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .neq('id', input.pipelineId)
    if (resetError) throw new Error(resetError.message)
  }

  const { error: pipelineError } = await supabase
    .from('pipelines')
    .update({ name: pipelineName, is_default: input.is_default, updated_at: new Date().toISOString() })
    .eq('id', input.pipelineId)
  if (pipelineError) throw new Error(pipelineError.message)

  if (input.deletedStageIds?.length) {
    const { error: deleteError } = await supabase
      .from('pipeline_stages')
      .delete()
      .in('id', input.deletedStageIds)
      .eq('pipeline_id', input.pipelineId)
    if (deleteError) throw new Error(deleteError.message)
  }

  // Update existing + create new stages by draft order.
  for (let idx = 0; idx < input.stages.length; idx++) {
    const stage = input.stages[idx]
    const payload = {
      name: btrim(stage.name),
      color: normalizeHexColor(stage.color),
      sort_order: idx + 1,
      updated_at: new Date().toISOString(),
    }

    if (stage.id) {
      const { error: updErr } = await supabase
        .from('pipeline_stages')
        .update(payload)
        .eq('id', stage.id)
        .eq('pipeline_id', input.pipelineId)
      if (updErr) throw new Error(updErr.message)
    } else {
      const { error: insErr } = await supabase.from('pipeline_stages').insert({
        tenant_id: tenantId,
        pipeline_id: input.pipelineId,
        name: payload.name,
        color: payload.color,
        sort_order: payload.sort_order,
      })
      if (insErr) throw new Error(insErr.message)
    }
  }

  const pipelines = await listPipelines(input.tenantSlug)
  const pipeline = pipelines.find((p) => p.id === input.pipelineId)
  if (!pipeline) throw new Error('Falha ao carregar a pipeline atualizada.')

  revalidatePath(`/${input.tenantSlug}/settings/pipelines`)
  revalidatePath(`/${input.tenantSlug}/crm`)
  revalidatePath(`/${input.tenantSlug}/inbox`)
  return pipeline
}


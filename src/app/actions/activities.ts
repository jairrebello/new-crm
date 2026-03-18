'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type Activity = {
  id: string
  deal_id: string
  user_id: string | null
  activity_type: string
  title: string | null
  body: string | null
  due_date: string | null
  completed_at: string | null
  metadata: Record<string, string> | null
  created_at: string
  user?: { first_name: string | null; last_name: string | null; avatar_url: string | null } | null
}

function firstOrNull<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null
  return (value as T) ?? null
}

export async function getDealActivities(dealId: string): Promise<Activity[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('activities')
    .select(`
      id, deal_id, user_id, activity_type, title, body,
      due_date, completed_at, metadata, created_at,
      user:users(first_name, last_name, avatar_url)
    `)
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  const normalized = (data ?? []).map((row: unknown) => {
    const r = row as Activity & { user?: unknown }
    return {
      ...r,
      user: firstOrNull<Activity['user']>(r.user),
    } satisfies Activity
  })
  return normalized
}

export async function logActivity(data: {
  dealId: string
  tenantSlug: string
  activityType: 'note' | 'call' | 'email' | 'meeting' | 'task'
  title?: string
  body?: string
  dueDate?: string | null
}) {
  const supabase = await createClient()

  const { data: authUser } = await supabase.auth.getUser()
  if (!authUser.user) throw new Error('Não autenticado.')

  // Get deal to get tenant_id
  const { data: deal } = await supabase
    .from('deals')
    .select('tenant_id')
    .eq('id', data.dealId)
    .single()

  if (!deal) throw new Error('Negócio não encontrado.')

  const { error } = await supabase.from('activities').insert({
    tenant_id: deal.tenant_id,
    deal_id: data.dealId,
    user_id: authUser.user.id,
    activity_type: data.activityType,
    title: data.title ?? null,
    body: data.body ?? null,
    due_date: data.dueDate ?? null,
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/${data.tenantSlug}/crm`)
}

export async function completeActivity(activityId: string, tenantSlug: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('activities')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', activityId)

  if (error) throw new Error(error.message)
  revalidatePath(`/${tenantSlug}/crm`)
}

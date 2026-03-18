'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { Deal } from '@/app/actions/deals'
import { getDealActivities, logActivity, type Activity } from '@/app/actions/activities'
import { getDealDetails, updateDeal } from '@/app/actions/deals'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type DealDetails = Awaited<ReturnType<typeof getDealDetails>>

type Props = {
  deal: Deal | null
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
}

function formatMoneyBRL(value: unknown) {
  const n = Number(value)
  if (Number.isNaN(n) || n <= 0) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
}

function activityLabel(type: string) {
  switch (type) {
    case 'note':
      return 'Nota'
    case 'stage_change':
      return 'Mudança de etapa'
    case 'call':
      return 'Ligação'
    case 'email':
      return 'E-mail'
    case 'meeting':
      return 'Reunião'
    case 'task':
      return 'Tarefa'
    default:
      return type
  }
}

export function DealDetailPanel({ deal, open, onOpenChange, tenantSlug }: Props) {
  const dealId = deal?.id ?? null
  const [pending, startTransition] = useTransition()
  const [details, setDetails] = useState<DealDetails | null>(null)
  const detailsDeal = details as unknown as (Partial<Deal> & { stage?: { id: string; name: string; color: string } | null }) | null
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<{
    title: string
    dealValue: string
    priority: 'low' | 'medium' | 'high'
    status: 'open' | 'won' | 'lost'
    expectedCloseDate: string
  } | null>(null)

  const title = useMemo(() => detailsDeal?.title ?? deal?.title ?? 'Negócio', [detailsDeal?.title, deal?.title])
  const dealFallback = useMemo(
    () => ({
      title: deal?.title,
      deal_value: deal?.deal_value,
      priority: deal?.priority,
      status: deal?.status,
      expected_close_date: deal?.expected_close_date,
    }),
    [deal?.deal_value, deal?.expected_close_date, deal?.priority, deal?.status, deal?.title]
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!open || !dealId) return
      setLoading(true)
      setError(null)
      try {
        const [d, a] = await Promise.all([getDealDetails(dealId), getDealActivities(dealId)])
        if (cancelled) return
        setDetails(d)
        setActivities(a)

        const dealRow = d as unknown as {
          title?: string | null
          deal_value?: number | null
          priority?: string | null
          status?: string | null
          expected_close_date?: string | null
        }
        setForm({
          title: dealRow.title ?? dealFallback.title ?? '',
          dealValue: String(dealRow.deal_value ?? dealFallback.deal_value ?? ''),
          priority: ((dealRow.priority ?? dealFallback.priority ?? 'medium') as 'low' | 'medium' | 'high'),
          status: ((dealRow.status ?? dealFallback.status ?? 'open') as 'open' | 'won' | 'lost'),
          expectedCloseDate: dealRow.expected_close_date
            ? new Date(dealRow.expected_close_date).toISOString().slice(0, 10)
            : '',
        })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Falha ao carregar detalhes.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, dealId, dealFallback])

  function handleAddNote() {
    if (!dealId) return
    const body = note.trim()
    if (!body) return

    setError(null)
    startTransition(async () => {
      try {
        await logActivity({ dealId, tenantSlug, activityType: 'note', body })
        setNote('')
        const refreshed = await getDealActivities(dealId)
        setActivities(refreshed)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar nota.')
      }
    })
  }

  function handleSave() {
    if (!dealId || !form) return
    const nextTitle = form.title.trim()
    if (!nextTitle) {
      setError('Informe um título.')
      return
    }

    const nextValue = form.dealValue.trim() ? Number(form.dealValue) : 0
    if (Number.isNaN(nextValue) || nextValue < 0) {
      setError('Valor inválido.')
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await updateDeal(
          dealId,
          {
            title: nextTitle,
            deal_value: nextValue,
            priority: form.priority,
            status: form.status,
            expected_close_date: form.expectedCloseDate ? form.expectedCloseDate : null,
          },
          tenantSlug
        )
        const [d, a] = await Promise.all([getDealDetails(dealId), getDealActivities(dealId)])
        setDetails(d)
        setActivities(a)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar alterações.')
      }
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setDetails(null)
          setActivities([])
          setNote('')
          setError(null)
          setForm(null)
        }
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="line-clamp-2">{title}</SheetTitle>
          <SheetDescription>
            {details?.stage?.name ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: details.stage.color ?? '#94a3b8' }}
                />
                <span>{details.stage.name}</span>
              </span>
            ) : (
              <span>Detalhes do deal</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="p-4 flex flex-col gap-4 overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">Detalhes</div>

            <div className="mt-3 grid gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Título</label>
                <Input
                  value={form?.title ?? ''}
                  onChange={(e) => setForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  placeholder="Ex: Venda ERP"
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium">Valor (R$)</label>
                  <Input
                    inputMode="decimal"
                    value={form?.dealValue ?? ''}
                    onChange={(e) => setForm((prev) => (prev ? { ...prev, dealValue: e.target.value } : prev))}
                    placeholder="0"
                    disabled={loading}
                  />
                  <div className="text-xs text-muted-foreground">
                    Atual: {formatMoneyBRL(detailsDeal?.deal_value ?? deal?.deal_value)}
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <label className="text-sm font-medium">Prioridade</label>
                  <Select
                    value={form?.priority ?? 'medium'}
                    onValueChange={(v) => {
                      if (v === 'low' || v === 'medium' || v === 'high') {
                        setForm((prev) => (prev ? { ...prev, priority: v } : prev))
                      }
                    }}
                    disabled={loading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="low">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={form?.status ?? 'open'}
                    onValueChange={(v) => {
                      if (v === 'open' || v === 'won' || v === 'lost') {
                        setForm((prev) => (prev ? { ...prev, status: v } : prev))
                      }
                    }}
                    disabled={loading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Aberto</SelectItem>
                      <SelectItem value="won">Ganho</SelectItem>
                      <SelectItem value="lost">Perdido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <label className="text-sm font-medium">Previsão de fechamento</label>
                  <Input
                    type="date"
                    value={form?.expectedCloseDate ?? ''}
                    onChange={(e) => setForm((prev) => (prev ? { ...prev, expectedCloseDate: e.target.value } : prev))}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button onClick={handleSave} disabled={pending || loading || !form || !dealId} size="sm">
                  {pending ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">Cliente</div>
            <div className="mt-1 text-sm font-medium">
              {details?.contact?.name ?? details?.account?.name ?? deal?.contact?.name ?? deal?.account?.name ?? '—'}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Atividades</div>
                <div className="text-sm text-muted-foreground mt-0.5">Notas e histórico do deal</div>
              </div>
              {loading && <span className="text-xs text-muted-foreground">Carregando...</span>}
            </div>

            <div className="mt-3 grid gap-2">
              {loading && (
                <>
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </>
              )}

              {!loading && activities.length === 0 && (
                <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  Nenhuma atividade ainda.
                </div>
              )}

              {!loading &&
                activities.slice(0, 20).map((a) => (
                  <div key={a.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{activityLabel(a.activity_type)}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {(a.title || a.body) && (
                      <div className="mt-2 text-sm">
                        {a.title && <div className="font-medium">{a.title}</div>}
                        {a.body && <div className="text-muted-foreground whitespace-pre-wrap">{a.body}</div>}
                      </div>
                    )}
                  </div>
                ))}
            </div>

            <div className="mt-3 grid gap-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Adicionar nota..."
                className="min-h-20"
              />
              <div className="flex justify-end">
                <Button onClick={handleAddNote} disabled={pending || !note.trim() || !dealId} size="sm">
                  {pending ? 'Salvando...' : 'Salvar nota'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}


'use client'

import { useState, useTransition } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { Pipeline, Deal } from '@/app/actions/deals'
import { moveDeal } from '@/app/actions/deals'
import type { ContactOption } from '@/app/actions/contacts'
import { PipelineColumn } from './pipeline-column'
import { DealCardView } from './deal-card'
import { DealDetailPanel } from './deal-detail-panel'
import { NewDealDialog } from './new-deal-dialog'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Props = {
  pipelines: Pipeline[]
  tenantSlug: string
  contacts: ContactOption[]
}

export function KanbanBoard({ pipelines, tenantSlug, contacts }: Props) {
  const [localPipelines, setLocalPipelines] = useState<Pipeline[]>(pipelines)
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [newDealOpen, setNewDealOpen] = useState(false)
  const [, startTransition] = useTransition()
  const initialPipelineId = pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id ?? ''
  const [selectedPipelineId, setSelectedPipelineId] = useState(initialPipelineId)
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const effectiveSelectedPipelineId =
    localPipelines.some((p) => p.id === selectedPipelineId)
      ? selectedPipelineId
      : localPipelines.find((p) => p.is_default)?.id ?? localPipelines[0]?.id ?? ''

  const currentPipeline =
    localPipelines.find((p) => p.id === effectiveSelectedPipelineId) ??
    localPipelines.find((p) => p.is_default) ??
    localPipelines[0]

  function handleDragStart(event: DragStartEvent) {
    const deal = event.active.data.current?.deal as Deal
    setActiveDeal(deal ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDeal(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const dealId = active.id as string
    const newStageId = over.id as string

    // Optimistic UI update
    setLocalPipelines((prev) =>
      prev.map((pipeline) => ({
        ...pipeline,
        stages: pipeline.stages.map((stage) => ({
          ...stage,
          deals: stage.deals.filter((d) => d.id !== dealId),
        })).map((stage) => {
          if (stage.id === newStageId) {
            const deal = prev
              .flatMap((p) => p.stages)
              .flatMap((s) => s.deals)
              .find((d) => d.id === dealId)
            return deal ? { ...stage, deals: [...stage.deals, { ...deal, stage_id: newStageId }] } : stage
          }
          return stage
        }),
      }))
    )

    startTransition(() => {
      moveDeal(dealId, newStageId, tenantSlug)
    })
  }

  function handleDealOpen(deal: Deal) {
    setSelectedDeal(deal)
    setPanelOpen(true)
  }

  function handleDealCreated(deal: Deal) {
    setLocalPipelines((prev) =>
      prev.map((pipeline) => ({
        ...pipeline,
        stages: pipeline.stages.map((stage) =>
          stage.id === deal.stage_id
            ? { ...stage, deals: [deal, ...stage.deals] }
            : stage
        ),
      }))
    )
  }

  if (!currentPipeline) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-slate-500">
          <p className="text-lg font-medium mb-2">Nenhuma pipeline encontrada</p>
          <p className="text-sm">Crie uma pipeline em Configurações para começar.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{currentPipeline.name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {currentPipeline.stages.reduce((n, s) => n + s.deals.length, 0)} negócios abertos ·{' '}
            {money.format(
              currentPipeline.stages
                .flatMap((s) => s.deals)
                .reduce((sum, d) => sum + (Number(d.deal_value) || 0), 0)
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {localPipelines.length > 1 && (
            <Select value={effectiveSelectedPipelineId} onValueChange={(v) => setSelectedPipelineId(v ?? '')}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Selecione pipeline" />
              </SelectTrigger>
              <SelectContent>
                {localPipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.is_default ? ' (padrão)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setNewDealOpen(true)} size="sm" className="gap-1.5">
            <PlusIcon className="h-4 w-4" />
            Novo negócio
          </Button>
        </div>
      </div>

      {/* Board */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex gap-3 overflow-x-auto pb-4">
          {currentPipeline.stages.map((stage) => (
            <PipelineColumn key={stage.id} stage={stage} onDealOpen={handleDealOpen} />
          ))}
        </div>

        <DragOverlay>
          {activeDeal && (
            <div className="rotate-2 opacity-90">
              <DealCardView deal={activeDeal} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Detail Panel */}
      <DealDetailPanel
        deal={selectedDeal}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        tenantSlug={tenantSlug}
      />

      {/* New Deal Dialog */}
      <NewDealDialog
        open={newDealOpen}
        onOpenChange={setNewDealOpen}
        pipeline={currentPipeline}
        tenantSlug={tenantSlug}
        onCreated={handleDealCreated}
        contacts={contacts}
      />
    </div>
  )
}

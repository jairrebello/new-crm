'use client'

import { useDroppable } from '@dnd-kit/core'
import type { PipelineStage, Deal } from '@/app/actions/deals'
import { DealCard } from './deal-card'
import { cn } from '@/lib/utils'

type Props = {
  stage: PipelineStage
  onDealOpen: (deal: Deal) => void
}

export function PipelineColumn({ stage, onDealOpen }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  return (
    <div className="min-w-[280px] max-w-[280px] h-full flex flex-col rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50">
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: stage.color ?? '#94a3b8' }}
          />
          <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">
            {stage.name}
          </span>
        </div>
        <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium px-2 py-0.5 rounded-full">
          {stage.deals.length}
        </span>
      </div>

      {/* Stage total value */}
      {stage.deals.length > 0 && (
        <div className="px-3 pb-2">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {money.format(stage.deals.reduce((sum, d) => sum + (Number(d.deal_value) || 0), 0))}
          </span>
        </div>
      )}

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          // min-h-0 é importante para permitir que flex-1 respeite a altura do container
          // e não “vaze” conteúdo para fora do estágio.
          'flex-1 flex flex-col gap-2 p-2 min-h-[120px] min-h-0 overflow-y-auto rounded-b-xl transition-colors',
          isOver && 'bg-blue-50 dark:bg-blue-900/20'
        )}
      >
        {stage.deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} onOpen={onDealOpen} />
        ))}
        {stage.deals.length === 0 && (
          <div className={cn(
            'flex-1 flex items-center justify-center rounded-lg border-2 border-dashed',
            'text-xs text-slate-400 dark:text-slate-600 min-h-[80px]',
            isOver
              ? 'border-blue-400 dark:border-blue-500 text-blue-500'
              : 'border-slate-200 dark:border-slate-700'
          )}>
            {isOver ? 'Solte aqui' : 'Sem negócios'}
          </div>
        )}
      </div>
    </div>
  )
}
